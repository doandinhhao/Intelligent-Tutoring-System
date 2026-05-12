import { query, withTransaction } from "../database/db.js";
import { AppError } from "../helpers/errors.js";
import { writeAuditLog } from "./auditService.js";
import { syncOrderStatusFromItems } from "./orderService.js";
import { closeSessionIfDone } from "./tableService.js";

const REQUEST_TYPES = ["cancel_item", "change_quantity", "change_note"];
const REVIEW_STATUS = ["approved", "rejected"];

const mapChangeRequest = (row) => ({
  ...row,
  change_request_id: Number(row.change_request_id),
  order_item_id: Number(row.order_item_id),
  order_id: Number(row.order_id),
  requested_by: Number(row.requested_by),
  reviewed_by: row.reviewed_by === null ? null : Number(row.reviewed_by),
  requested_quantity:
    row.requested_quantity === null ? null : Number(row.requested_quantity),
});

const getChangeRequestById = async (changeRequestId) => {
  const result = await query(
    `
    SELECT
      cr.change_request_id::int AS change_request_id,
      cr.order_item_id::int AS order_item_id,
      cr.order_id::int AS order_id,
      cr.request_type_key,
      cr.requested_by::int AS requested_by,
      cr.requested_at,
      cr.requested_quantity,
      cr.requested_note,
      cr.reason,
      cr.status_key,
      cr.reviewed_by::int AS reviewed_by,
      cr.reviewed_at,
      cr.kitchen_note,
      oi.item_name_snapshot,
      oi.kitchen_status_key AS current_item_status_key,
      oi.quantity AS current_quantity,
      oi.note AS current_note,
      o.order_no,
      dt.table_code,
      requester.full_name AS requested_by_name,
      reviewer.full_name AS reviewed_by_name
    FROM order_item_change_requests cr
    JOIN order_items oi ON oi.order_item_id = cr.order_item_id
    JOIN orders o ON o.order_id = cr.order_id
    JOIN table_sessions ts ON ts.session_id = o.session_id
    JOIN dining_tables dt ON dt.table_id = ts.current_table_id
    JOIN users requester ON requester.user_id = cr.requested_by
    LEFT JOIN users reviewer ON reviewer.user_id = cr.reviewed_by
    WHERE cr.change_request_id = $1
    LIMIT 1
    `,
    [changeRequestId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError("Change request not found", 404);
  }
  return mapChangeRequest(row);
};

export const listOrderChangeRequests = async ({ orderId, status }) => {
  const params = [orderId];
  let statusClause = "";

  if (status && status.length > 0) {
    params.push(status);
    statusClause = "AND cr.status_key = ANY($2::text[])";
  }

  const result = await query(
    `
    SELECT
      cr.change_request_id::int AS change_request_id,
      cr.order_item_id::int AS order_item_id,
      cr.order_id::int AS order_id,
      cr.request_type_key,
      cr.requested_by::int AS requested_by,
      cr.requested_at,
      cr.requested_quantity,
      cr.requested_note,
      cr.reason,
      cr.status_key,
      cr.reviewed_by::int AS reviewed_by,
      cr.reviewed_at,
      cr.kitchen_note,
      oi.item_name_snapshot,
      oi.kitchen_status_key AS current_item_status_key,
      oi.quantity AS current_quantity,
      oi.note AS current_note,
      o.order_no,
      dt.table_code,
      requester.full_name AS requested_by_name,
      reviewer.full_name AS reviewed_by_name
    FROM order_item_change_requests cr
    JOIN order_items oi ON oi.order_item_id = cr.order_item_id
    JOIN orders o ON o.order_id = cr.order_id
    JOIN table_sessions ts ON ts.session_id = o.session_id
    JOIN dining_tables dt ON dt.table_id = ts.current_table_id
    JOIN users requester ON requester.user_id = cr.requested_by
    LEFT JOIN users reviewer ON reviewer.user_id = cr.reviewed_by
    WHERE cr.order_id = $1
      ${statusClause}
    ORDER BY cr.requested_at DESC, cr.change_request_id DESC
    `,
    params,
  );

  return result.rows.map(mapChangeRequest);
};

export const createOrderItemChangeRequest = async ({
  orderId,
  orderItemId,
  requestType,
  requestedQuantity,
  requestedNote,
  reason,
  requestedBy,
}) => {
  if (!REQUEST_TYPES.includes(requestType)) {
    throw new AppError("Unsupported change request type", 400);
  }

  const normalizedReason = reason?.trim() || "";
  const normalizedNote = requestedNote?.trim() || null;

  const request = await withTransaction(async (client) => {
    const orderResult = await client.query(
      `
      SELECT order_id, order_status_key
      FROM orders
      WHERE order_id = $1
      LIMIT 1
      FOR UPDATE
      `,
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      throw new AppError("Order not found", 404);
    }
    if (!["confirmed", "in_progress", "ready_to_serve"].includes(order.order_status_key)) {
      throw new AppError("Change request is only available after order is sent to kitchen", 400);
    }

    const itemResult = await client.query(
      `
      SELECT
        order_item_id,
        order_id,
        quantity,
        note,
        kitchen_status_key
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
    if (["cancelled", "served"].includes(item.kitchen_status_key)) {
      throw new AppError("This item is already finalized", 400);
    }

    const pendingResult = await client.query(
      `
      SELECT change_request_id
      FROM order_item_change_requests
      WHERE order_item_id = $1 AND status_key = 'pending'
      LIMIT 1
      `,
      [orderItemId],
    );
    if (pendingResult.rows[0]) {
      throw new AppError("This item already has a pending change request", 409);
    }

    if (requestType === "change_quantity") {
      if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
        throw new AppError("Requested quantity must be a positive integer", 400);
      }
      if (requestedQuantity === Number(item.quantity)) {
        throw new AppError("Requested quantity is the same as current quantity", 400);
      }
    }

    if (requestType === "change_note") {
      if (!normalizedNote) {
        throw new AppError("Requested note is required", 400);
      }
      if (normalizedNote === (item.note || "")) {
        throw new AppError("Requested note is the same as current note", 400);
      }
    }

    const inserted = await client.query(
      `
      INSERT INTO order_item_change_requests (
        order_item_id,
        order_id,
        request_type_key,
        requested_by,
        requested_at,
        requested_quantity,
        requested_note,
        reason,
        status_key,
        reviewed_by,
        reviewed_at,
        kitchen_note
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        NOW(),
        $5,
        $6,
        $7,
        'pending',
        NULL,
        NULL,
        ''
      )
      RETURNING change_request_id
      `,
      [
        orderItemId,
        orderId,
        requestType,
        requestedBy,
        requestType === "change_quantity" ? requestedQuantity : null,
        requestType === "change_note" ? normalizedNote : null,
        normalizedReason,
      ],
    );

    return Number(inserted.rows[0].change_request_id);
  });

  const hydratedRequest = await getChangeRequestById(request);

  await writeAuditLog({
    actorUserId: requestedBy,
    actionKey: "order_item.change_request.create",
    entityTypeKey: "order_item_change_requests",
    entityId: hydratedRequest.change_request_id,
    afterJson: hydratedRequest,
  });

  return hydratedRequest;
};

export const listKitchenChangeRequests = async ({ status }) => {
  const statusFilter = status && status.length > 0 ? status : ["pending"];
  const result = await query(
    `
    SELECT
      cr.change_request_id::int AS change_request_id,
      cr.order_item_id::int AS order_item_id,
      cr.order_id::int AS order_id,
      cr.request_type_key,
      cr.requested_by::int AS requested_by,
      cr.requested_at,
      cr.requested_quantity,
      cr.requested_note,
      cr.reason,
      cr.status_key,
      cr.reviewed_by::int AS reviewed_by,
      cr.reviewed_at,
      cr.kitchen_note,
      oi.item_name_snapshot,
      oi.kitchen_status_key AS current_item_status_key,
      oi.quantity AS current_quantity,
      oi.note AS current_note,
      o.order_no,
      dt.table_code,
      requester.full_name AS requested_by_name,
      reviewer.full_name AS reviewed_by_name
    FROM order_item_change_requests cr
    JOIN order_items oi ON oi.order_item_id = cr.order_item_id
    JOIN orders o ON o.order_id = cr.order_id
    JOIN table_sessions ts ON ts.session_id = o.session_id
    JOIN dining_tables dt ON dt.table_id = ts.current_table_id
    JOIN users requester ON requester.user_id = cr.requested_by
    LEFT JOIN users reviewer ON reviewer.user_id = cr.reviewed_by
    WHERE cr.status_key = ANY($1::text[])
    ORDER BY cr.requested_at ASC, cr.change_request_id ASC
    `,
    [statusFilter],
  );

  return result.rows.map(mapChangeRequest);
};

export const reviewOrderItemChangeRequest = async ({
  changeRequestId,
  decision,
  kitchenNote,
  reviewedBy,
}) => {
  if (!REVIEW_STATUS.includes(decision)) {
    throw new AppError("Invalid review decision", 400);
  }

  const normalizedKitchenNote = kitchenNote?.trim() || "";

  const outcome = await withTransaction(async (client) => {
    const requestResult = await client.query(
      `
      SELECT
        change_request_id,
        order_item_id,
        order_id,
        request_type_key,
        requested_quantity,
        requested_note,
        status_key
      FROM order_item_change_requests
      WHERE change_request_id = $1
      LIMIT 1
      FOR UPDATE
      `,
      [changeRequestId],
    );
    const request = requestResult.rows[0];
    if (!request) {
      throw new AppError("Change request not found", 404);
    }
    if (request.status_key !== "pending") {
      throw new AppError("This request has already been reviewed", 409);
    }

    const itemResult = await client.query(
      `
      SELECT
        order_item_id,
        order_id,
        quantity,
        note,
        kitchen_status_key,
        unit_price_snapshot::int AS unit_price_snapshot
      FROM order_items
      WHERE order_item_id = $1
      LIMIT 1
      FOR UPDATE
      `,
      [request.order_item_id],
    );
    const item = itemResult.rows[0];
    if (!item) {
      throw new AppError("Order item not found", 404);
    }

    if (decision === "approved") {
      if (["served", "cancelled"].includes(item.kitchen_status_key)) {
        throw new AppError("Item is already finalized and cannot be modified", 400);
      }

      if (request.request_type_key === "cancel_item") {
        await client.query(
          `
          UPDATE order_items
          SET kitchen_status_key = 'cancelled',
              completed_at = COALESCE(completed_at, NOW())
          WHERE order_item_id = $1
          `,
          [item.order_item_id],
        );
      }

      if (request.request_type_key === "change_quantity") {
        const qty = Number(request.requested_quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new AppError("Invalid requested quantity", 400);
        }
        await client.query(
          `
          UPDATE order_items
          SET quantity = $1,
              line_subtotal = unit_price_snapshot * $2::numeric
          WHERE order_item_id = $3
          `,
          [qty, qty, item.order_item_id],
        );
      }

      if (request.request_type_key === "change_note") {
        const nextNote = request.requested_note?.trim() || "";
        await client.query(
          `
          UPDATE order_items
          SET note = $1
          WHERE order_item_id = $2
          `,
          [nextNote, item.order_item_id],
        );
      }
    }

    await client.query(
      `
      UPDATE order_item_change_requests
      SET
        status_key = $1,
        reviewed_by = $2,
        reviewed_at = NOW(),
        kitchen_note = $3
      WHERE change_request_id = $4
      `,
      [decision, reviewedBy, normalizedKitchenNote, changeRequestId],
    );

    return {
      orderId: Number(request.order_id),
      orderItemId: Number(request.order_item_id),
      requestType: request.request_type_key,
      decision,
    };
  });

  const reviewedRequest = await getChangeRequestById(changeRequestId);

  await writeAuditLog({
    actorUserId: reviewedBy,
    actionKey: "order_item.change_request.review",
    entityTypeKey: "order_item_change_requests",
    entityId: reviewedRequest.change_request_id,
    beforeJson: { status_key: "pending" },
    afterJson: reviewedRequest,
  });

  if (outcome.decision === "approved") {
    const order = await syncOrderStatusFromItems(outcome.orderId);
    await closeSessionIfDone(order.session_id);
  }

  return reviewedRequest;
};
