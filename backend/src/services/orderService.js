import { query, withTransaction } from "../database/db.js";
import { AppError } from "../helpers/errors.js";
import { writeAuditLog } from "./auditService.js";
import { getSessionById } from "./tableService.js";

const buildOrderNumber = (orderId) => {
  const d = new Date();
  const dateSegment = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  return `ORD-${dateSegment}-${String(orderId).padStart(4, "0")}`;
};

const mapOrder = (row) => ({
  ...row,
  order_id: Number(row.order_id),
  session_id: Number(row.session_id),
  created_by: Number(row.created_by),
  confirmed_by: row.confirmed_by === null ? null : Number(row.confirmed_by),
});

const mapOrderItem = (row) => ({
  ...row,
  order_item_id: Number(row.order_item_id),
  order_id: Number(row.order_id),
  parent_order_item_id:
    row.parent_order_item_id === null ? null : Number(row.parent_order_item_id),
  menu_item_id: Number(row.menu_item_id),
  added_by: Number(row.added_by),
  unit_price_snapshot: Number(row.unit_price_snapshot || 0),
  line_subtotal: Number(row.line_subtotal || 0),
});

const fetchOrderById = async (orderId, runner = query) => {
  const result = await runner(
    `
    SELECT
      order_id,
      session_id,
      order_no,
      order_type_key,
      order_status_key,
      created_by,
      confirmed_by,
      ordered_at,
      confirmed_at,
      completed_at,
      notes
    FROM orders
    WHERE order_id = $1
    LIMIT 1
    `,
    [orderId],
  );
  return result.rows[0] ? mapOrder(result.rows[0]) : null;
};

const fetchOrderItems = async (orderId, runner = query) => {
  const result = await runner(
    `
    SELECT
      order_item_id,
      order_id,
      parent_order_item_id,
      menu_item_id,
      item_name_snapshot,
      quantity,
      unit_price_snapshot::int AS unit_price_snapshot,
      line_subtotal::int AS line_subtotal,
      selected_options_json,
      note,
      kitchen_status_key,
      completed_at,
      served_at,
      added_by,
      added_at
    FROM order_items
    WHERE order_id = $1
    ORDER BY added_at ASC, order_item_id ASC
    `,
    [orderId],
  );

  return result.rows.map(mapOrderItem);
};

const sanitizeOrder = async (order, runner = query) => {
  const items = await fetchOrderItems(order.order_id, runner);
  return {
    ...order,
    items,
  };
};

export const getOrderDetail = async (orderId) => {
  const order = await fetchOrderById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  return sanitizeOrder(order);
};

export const getActiveOrderBySession = async (sessionId) => {
  const result = await query(
    `
    SELECT
      order_id,
      session_id,
      order_no,
      order_type_key,
      order_status_key,
      created_by,
      confirmed_by,
      ordered_at,
      confirmed_at,
      completed_at,
      notes
    FROM orders
    WHERE session_id = $1
      AND order_status_key = ANY($2::text[])
    ORDER BY ordered_at DESC
    LIMIT 1
    `,
    [sessionId, ["draft", "confirmed", "in_progress", "ready_to_serve"]],
  );

  const order = result.rows[0];
  if (!order) {
    return null;
  }

  return sanitizeOrder(mapOrder(order));
};

export const listOrdersBySession = async ({ sessionId, statuses = null }) => {
  await getSessionById(sessionId);

  const statusList =
    statuses && statuses.length > 0
      ? statuses
      : ["draft", "confirmed", "in_progress", "ready_to_serve", "completed"];

  const result = await query(
    `
    SELECT
      order_id,
      session_id,
      order_no,
      order_type_key,
      order_status_key,
      created_by,
      confirmed_by,
      ordered_at,
      confirmed_at,
      completed_at,
      notes
    FROM orders
    WHERE session_id = $1
      AND order_status_key = ANY($2::text[])
    ORDER BY ordered_at ASC, order_id ASC
    `,
    [sessionId, statusList],
  );

  const orders = [];
  for (const row of result.rows) {
    // Keep each order hydrated with its own immutable item snapshots.
    // This allows waiter to see old sent orders while creating add-on drafts.
    // eslint-disable-next-line no-await-in-loop
    const hydrated = await sanitizeOrder(mapOrder(row));
    orders.push(hydrated);
  }

  return orders;
};

export const createOrGetDraftOrder = async ({ sessionId, notes, createdBy }) => {
  const session = await getSessionById(sessionId);
  if (["awaiting_payment", "closed"].includes(session.session_status_key)) {
    throw new AppError("Session is waiting for payment/closed and cannot accept new orders", 400);
  }

  if (session.session_status_key === "service_completed") {
    await query(
      `
      UPDATE table_sessions
      SET session_status_key = 'open', ended_at = NULL
      WHERE session_id = $1
      `,
      [sessionId],
    );
  }

  const existingDraftResult = await query(
    `
    SELECT
      order_id,
      session_id,
      order_no,
      order_type_key,
      order_status_key,
      created_by,
      confirmed_by,
      ordered_at,
      confirmed_at,
      completed_at,
      notes
    FROM orders
    WHERE session_id = $1 AND order_status_key = 'draft'
    ORDER BY ordered_at DESC
    LIMIT 1
    `,
    [sessionId],
  );

  if (existingDraftResult.rows[0]) {
    return sanitizeOrder(mapOrder(existingDraftResult.rows[0]));
  }

  const createdOrder = await withTransaction(async (client) => {
    const inserted = await client.query(
      `
      INSERT INTO orders (
        session_id,
        order_no,
        order_type_key,
        order_status_key,
        created_by,
        confirmed_by,
        ordered_at,
        confirmed_at,
        completed_at,
        notes
      )
      VALUES ($1, NULL, 'dine_in', 'draft', $2, NULL, NOW(), NULL, NULL, $3)
      RETURNING
        order_id,
        session_id,
        order_no,
        order_type_key,
        order_status_key,
        created_by,
        confirmed_by,
        ordered_at,
        confirmed_at,
        completed_at,
        notes
      `,
      [sessionId, createdBy, notes?.trim() || ""],
    );

    const order = mapOrder(inserted.rows[0]);
    const orderNo = buildOrderNumber(order.order_id);
    const updated = await client.query(
      `
      UPDATE orders
      SET order_no = $1
      WHERE order_id = $2
      RETURNING
        order_id,
        session_id,
        order_no,
        order_type_key,
        order_status_key,
        created_by,
        confirmed_by,
        ordered_at,
        confirmed_at,
        completed_at,
        notes
      `,
      [orderNo, order.order_id],
    );

    return mapOrder(updated.rows[0]);
  });

  await writeAuditLog({
    actorUserId: createdBy,
    actionKey: "order.create_draft",
    entityTypeKey: "orders",
    entityId: createdOrder.order_id,
    afterJson: createdOrder,
  });

  return sanitizeOrder(createdOrder);
};

export const addOrderItem = async ({
  orderId,
  menuItemId,
  quantity,
  selectedOptions = {},
  note = "",
  addedBy,
}) => {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError("Quantity must be a positive integer", 400);
  }

  const normalizedNote = note?.trim() || "";
  const normalizedOptions = selectedOptions || {};

  const result = await withTransaction(async (client) => {
    const orderResult = await client.query(
      "SELECT order_id, order_status_key FROM orders WHERE order_id = $1 LIMIT 1 FOR UPDATE",
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      throw new AppError("Order not found", 404);
    }
    if (order.order_status_key !== "draft") {
      throw new AppError("Only draft orders can be edited", 400);
    }

    const menuItemResult = await client.query(
      `
      SELECT menu_item_id, item_name, base_price::int AS base_price, availability_key
      FROM menu_items
      WHERE menu_item_id = $1
      LIMIT 1
      `,
      [menuItemId],
    );
    const menuItem = menuItemResult.rows[0];
    if (!menuItem) {
      throw new AppError("Menu item not found", 404);
    }
    if (menuItem.availability_key !== "available") {
      throw new AppError("Menu item is unavailable", 400);
    }

    const existingResult = await client.query(
      `
      SELECT
        order_item_id,
        order_id,
        parent_order_item_id,
        menu_item_id,
        item_name_snapshot,
        quantity,
        unit_price_snapshot::int AS unit_price_snapshot,
        line_subtotal::int AS line_subtotal,
        selected_options_json,
        note,
        kitchen_status_key,
        completed_at,
        served_at,
        added_by,
        added_at
      FROM order_items
      WHERE order_id = $1
        AND menu_item_id = $2
        AND kitchen_status_key = 'pending_confirm'
        AND note = $3
        AND selected_options_json = $4::jsonb
      ORDER BY added_at ASC
      LIMIT 1
      FOR UPDATE
      `,
      [orderId, menuItem.menu_item_id, normalizedNote, JSON.stringify(normalizedOptions)],
    );

    const existing = existingResult.rows[0];
    if (existing) {
      const before = mapOrderItem(existing);
      const nextQuantity = Number(existing.quantity) + quantity;
      const nextSubtotal = Number(existing.unit_price_snapshot) * nextQuantity;

      const updatedResult = await client.query(
        `
        UPDATE order_items
        SET quantity = $1, line_subtotal = $2
        WHERE order_item_id = $3
        RETURNING
          order_item_id,
          order_id,
          parent_order_item_id,
          menu_item_id,
          item_name_snapshot,
          quantity,
          unit_price_snapshot::int AS unit_price_snapshot,
          line_subtotal::int AS line_subtotal,
          selected_options_json,
          note,
          kitchen_status_key,
          completed_at,
          served_at,
          added_by,
          added_at
        `,
        [nextQuantity, nextSubtotal, existing.order_item_id],
      );

      return {
        action: "merge",
        before,
        item: mapOrderItem(updatedResult.rows[0]),
      };
    }

    const inserted = await client.query(
      `
      INSERT INTO order_items (
        order_id,
        parent_order_item_id,
        menu_item_id,
        item_name_snapshot,
        quantity,
        unit_price_snapshot,
        line_subtotal,
        selected_options_json,
        note,
        kitchen_status_key,
        completed_at,
        served_at,
        added_by,
        added_at
      )
      VALUES (
        $1,
        NULL,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb,
        $8,
        'pending_confirm',
        NULL,
        NULL,
        $9,
        NOW()
      )
      RETURNING
        order_item_id,
        order_id,
        parent_order_item_id,
        menu_item_id,
        item_name_snapshot,
        quantity,
        unit_price_snapshot::int AS unit_price_snapshot,
        line_subtotal::int AS line_subtotal,
        selected_options_json,
        note,
        kitchen_status_key,
        completed_at,
        served_at,
        added_by,
        added_at
      `,
      [
        orderId,
        menuItem.menu_item_id,
        menuItem.item_name,
        quantity,
        menuItem.base_price,
        menuItem.base_price * quantity,
        JSON.stringify(normalizedOptions),
        normalizedNote,
        addedBy,
      ],
    );

    return {
      action: "add",
      item: mapOrderItem(inserted.rows[0]),
    };
  });

  if (result.action === "merge") {
    await writeAuditLog({
      actorUserId: addedBy,
      actionKey: "order_item.merge_quantity",
      entityTypeKey: "order_items",
      entityId: result.item.order_item_id,
      beforeJson: result.before,
      afterJson: result.item,
    });
    return result.item;
  }

  await writeAuditLog({
    actorUserId: addedBy,
    actionKey: "order_item.add",
    entityTypeKey: "order_items",
    entityId: result.item.order_item_id,
    afterJson: result.item,
  });

  return result.item;
};

export const updateOrderItem = async ({ orderId, orderItemId, quantity, note, updatedBy }) => {
  const item = await withTransaction(async (client) => {
    const orderResult = await client.query(
      "SELECT order_id, order_status_key FROM orders WHERE order_id = $1 LIMIT 1 FOR UPDATE",
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      throw new AppError("Order not found", 404);
    }
    if (order.order_status_key !== "draft") {
      throw new AppError("Only draft orders can be edited", 400);
    }

    const itemResult = await client.query(
      `
      SELECT
        order_item_id,
        order_id,
        parent_order_item_id,
        menu_item_id,
        item_name_snapshot,
        quantity,
        unit_price_snapshot::int AS unit_price_snapshot,
        line_subtotal::int AS line_subtotal,
        selected_options_json,
        note,
        kitchen_status_key,
        completed_at,
        served_at,
        added_by,
        added_at
      FROM order_items
      WHERE order_item_id = $1 AND order_id = $2
      LIMIT 1
      FOR UPDATE
      `,
      [orderItemId, orderId],
    );

    const existingItem = itemResult.rows[0];
    if (!existingItem) {
      throw new AppError("Order item not found", 404);
    }
    if (existingItem.kitchen_status_key !== "pending_confirm") {
      throw new AppError("Order item can no longer be edited", 400);
    }

    const before = mapOrderItem(existingItem);
    const updates = {
      quantity: existingItem.quantity,
      note: existingItem.note || "",
      lineSubtotal: Number(existingItem.line_subtotal || 0),
    };

    if (quantity !== undefined) {
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new AppError("Quantity must be a positive integer", 400);
      }
      updates.quantity = quantity;
      updates.lineSubtotal = Number(existingItem.unit_price_snapshot || 0) * quantity;
    }

    if (note !== undefined) {
      updates.note = note.trim();
    }

    const updatedResult = await client.query(
      `
      UPDATE order_items
      SET quantity = $1, line_subtotal = $2, note = $3
      WHERE order_item_id = $4
      RETURNING
        order_item_id,
        order_id,
        parent_order_item_id,
        menu_item_id,
        item_name_snapshot,
        quantity,
        unit_price_snapshot::int AS unit_price_snapshot,
        line_subtotal::int AS line_subtotal,
        selected_options_json,
        note,
        kitchen_status_key,
        completed_at,
        served_at,
        added_by,
        added_at
      `,
      [updates.quantity, updates.lineSubtotal, updates.note, orderItemId],
    );

    return {
      before,
      after: mapOrderItem(updatedResult.rows[0]),
    };
  });

  await writeAuditLog({
    actorUserId: updatedBy,
    actionKey: "order_item.update",
    entityTypeKey: "order_items",
    entityId: orderItemId,
    beforeJson: item.before,
    afterJson: item.after,
  });

  return item.after;
};

export const removeOrderItem = async ({ orderId, orderItemId, removedBy }) => {
  const removedItem = await withTransaction(async (client) => {
    const orderResult = await client.query(
      "SELECT order_id, order_status_key FROM orders WHERE order_id = $1 LIMIT 1 FOR UPDATE",
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      throw new AppError("Order not found", 404);
    }
    if (order.order_status_key !== "draft") {
      throw new AppError("Only draft orders can be edited", 400);
    }

    const itemResult = await client.query(
      `
      SELECT
        order_item_id,
        order_id,
        parent_order_item_id,
        menu_item_id,
        item_name_snapshot,
        quantity,
        unit_price_snapshot::int AS unit_price_snapshot,
        line_subtotal::int AS line_subtotal,
        selected_options_json,
        note,
        kitchen_status_key,
        completed_at,
        served_at,
        added_by,
        added_at
      FROM order_items
      WHERE order_item_id = $1 AND order_id = $2
      LIMIT 1
      FOR UPDATE
      `,
      [orderItemId, orderId],
    );
    const item = itemResult.rows[0];
    if (!item) {
      throw new AppError("Order item not found", 404);
    }
    if (item.kitchen_status_key !== "pending_confirm") {
      throw new AppError("Order item can no longer be removed", 400);
    }

    await client.query("DELETE FROM order_items WHERE order_item_id = $1", [orderItemId]);
    return mapOrderItem(item);
  });

  await writeAuditLog({
    actorUserId: removedBy,
    actionKey: "order_item.remove",
    entityTypeKey: "order_items",
    entityId: orderItemId,
    beforeJson: removedItem,
  });
};

export const confirmOrder = async ({ orderId, confirmedBy }) => {
  const order = await withTransaction(async (client) => {
    const orderResult = await client.query(
      `
      SELECT
        order_id,
        session_id,
        order_no,
        order_type_key,
        order_status_key,
        created_by,
        confirmed_by,
        ordered_at,
        confirmed_at,
        completed_at,
        notes
      FROM orders
      WHERE order_id = $1
      LIMIT 1
      FOR UPDATE
      `,
      [orderId],
    );
    const existingOrder = orderResult.rows[0];
    if (!existingOrder) {
      throw new AppError("Order not found", 404);
    }
    if (existingOrder.order_status_key !== "draft") {
      throw new AppError("Order is not in draft state", 400);
    }

    const itemCountResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = $1",
      [orderId],
    );
    const itemCount = Number(itemCountResult.rows[0]?.count || 0);
    if (itemCount <= 0) {
      throw new AppError("Add at least one item before confirming", 400);
    }

    const updatedOrderResult = await client.query(
      `
      UPDATE orders
      SET order_status_key = 'confirmed', confirmed_by = $1, confirmed_at = NOW()
      WHERE order_id = $2
      RETURNING
        order_id,
        session_id,
        order_no,
        order_type_key,
        order_status_key,
        created_by,
        confirmed_by,
        ordered_at,
        confirmed_at,
        completed_at,
        notes
      `,
      [confirmedBy, orderId],
    );

    await client.query(
      `
      UPDATE order_items
      SET kitchen_status_key = 'new'
      WHERE order_id = $1 AND kitchen_status_key = 'pending_confirm'
      `,
      [orderId],
    );

    return {
      before: mapOrder(existingOrder),
      after: mapOrder(updatedOrderResult.rows[0]),
    };
  });

  await writeAuditLog({
    actorUserId: confirmedBy,
    actionKey: "order.confirm",
    entityTypeKey: "orders",
    entityId: orderId,
    beforeJson: order.before,
    afterJson: order.after,
  });

  return getOrderDetail(orderId);
};

export const syncOrderStatusFromItems = async (orderId) => {
  const order = await fetchOrderById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  const statusesResult = await query(
    `
    SELECT kitchen_status_key, COUNT(*)::int AS count
    FROM order_items
    WHERE order_id = $1
    GROUP BY kitchen_status_key
    `,
    [orderId],
  );

  if (statusesResult.rows.length === 0) {
    return order;
  }

  const statusSet = new Set(statusesResult.rows.map((row) => row.kitchen_status_key));
  const totalCount = statusesResult.rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const servedOrCancelledCount = statusesResult.rows
    .filter((row) => ["served", "cancelled"].includes(row.kitchen_status_key))
    .reduce((sum, row) => sum + Number(row.count || 0), 0);

  let nextStatus = order.order_status_key;
  let setCompletedAt = false;

  if (servedOrCancelledCount === totalCount) {
    nextStatus = "completed";
    setCompletedAt = true;
  } else if (statusSet.has("ready") && !statusSet.has("new") && !statusSet.has("cooking")) {
    nextStatus = "ready_to_serve";
  } else if (statusSet.has("new") || statusSet.has("cooking") || statusSet.has("ready")) {
    nextStatus = "in_progress";
  }

  if (nextStatus === order.order_status_key && !(setCompletedAt && !order.completed_at)) {
    return order;
  }

  const updatedResult = await query(
    `
    UPDATE orders
    SET
      order_status_key = $1,
      completed_at = CASE
        WHEN $2::boolean = TRUE THEN COALESCE(completed_at, NOW())
        ELSE completed_at
      END
    WHERE order_id = $3
    RETURNING
      order_id,
      session_id,
      order_no,
      order_type_key,
      order_status_key,
      created_by,
      confirmed_by,
      ordered_at,
      confirmed_at,
      completed_at,
      notes
    `,
    [nextStatus, setCompletedAt, orderId],
  );

  return mapOrder(updatedResult.rows[0]);
};
