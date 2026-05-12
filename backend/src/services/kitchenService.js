import { query, withTransaction } from "../database/db.js";
import { AppError } from "../helpers/errors.js";
import { writeAuditLog } from "./auditService.js";
import { syncOrderStatusFromItems } from "./orderService.js";
import { closeSessionIfDone } from "./tableService.js";

const allowedKitchenTransitions = {
  new: ["cooking", "cancelled"],
  cooking: ["ready", "cancelled"],
  ready: ["served"],
  served: [],
  cancelled: [],
  pending_confirm: [],
};

const stationDeadlineCase = `
  CASE
    WHEN mi.station_key = 'beverage' THEN 5
    WHEN mi.station_key = 'dessert' THEN 8
    WHEN mi.station_key = 'cold_kitchen' THEN 8
    WHEN mi.station_key = 'fryer' THEN 10
    WHEN mi.station_key = 'grill' THEN 15
    ELSE 12
  END
`;

const overdueCondition = `NOW() > (oi.added_at + (${stationDeadlineCase} * INTERVAL '1 minute'))`;
const dueSoonCondition = `NOW() > (oi.added_at + ((${stationDeadlineCase} - 2) * INTERVAL '1 minute'))`;

const urgencyKeyCase = `
  CASE
    WHEN ${overdueCondition} THEN 'overdue'
    WHEN ${dueSoonCondition} THEN 'due_soon'
    ELSE 'normal'
  END
`;

const urgencyRankCase = `
  CASE
    WHEN ${overdueCondition} THEN 1
    WHEN ${dueSoonCondition} THEN 2
    ELSE 3
  END
`;

const kitchenItemSelect = `
  SELECT
    oi.order_item_id,
    oi.order_id,
    oi.parent_order_item_id,
    oi.menu_item_id,
    oi.item_name_snapshot,
    oi.quantity,
    oi.unit_price_snapshot::int AS unit_price_snapshot,
    oi.line_subtotal::int AS line_subtotal,
    oi.selected_options_json,
    oi.note,
    oi.kitchen_status_key,
    oi.completed_at,
    oi.served_at,
    oi.added_by,
    oi.added_at,
    o.order_no,
    o.order_status_key,
    ts.session_id,
    dt.table_code,
    dt.table_id,
    dt.area_key,
    mi.station_key,
    ${stationDeadlineCase}::int AS expected_cook_minutes,
    (oi.added_at + (${stationDeadlineCase} * INTERVAL '1 minute')) AS due_at,
    ${urgencyKeyCase} AS urgency_key,
    ${urgencyRankCase}::int AS urgency_rank,
    GREATEST(0, EXTRACT(EPOCH FROM (NOW() - oi.added_at)) / 60)::int AS queue_age_minutes
  FROM order_items oi
  JOIN orders o ON o.order_id = oi.order_id
  JOIN table_sessions ts ON ts.session_id = o.session_id
  JOIN dining_tables dt ON dt.table_id = ts.current_table_id
  JOIN menu_items mi ON mi.menu_item_id = oi.menu_item_id
`;

const mapKitchenItem = (row) => ({
  ...row,
  order_item_id: Number(row.order_item_id),
  order_id: Number(row.order_id),
  parent_order_item_id:
    row.parent_order_item_id === null ? null : Number(row.parent_order_item_id),
  menu_item_id: Number(row.menu_item_id),
  added_by: Number(row.added_by),
  session_id: Number(row.session_id),
  table_id: Number(row.table_id),
  unit_price_snapshot: Number(row.unit_price_snapshot || 0),
  line_subtotal: Number(row.line_subtotal || 0),
    expected_cook_minutes: Number(row.expected_cook_minutes || 0),
    urgency_rank: Number(row.urgency_rank || 3),
    queue_age_minutes: Number(row.queue_age_minutes || 0),
});

const getHydratedKitchenItemById = async (itemId) => {
  const result = await query(
    `
    ${kitchenItemSelect}
    WHERE oi.order_item_id = $1
    LIMIT 1
    `,
    [itemId],
  );
  const item = result.rows[0];
  if (!item) {
    throw new AppError("Order item not found", 404);
  }
  return mapKitchenItem(item);
};

export const listKitchenItems = async ({ status }) => {
  const statuses = status ? status.split(",").map((value) => value.trim()) : null;
  const params = [];

  let statusFilter = "oi.kitchen_status_key <> 'pending_confirm'";
  if (statuses && statuses.length > 0) {
    params.push(statuses);
    statusFilter = `${statusFilter} AND oi.kitchen_status_key = ANY($1::text[])`;
  }

  const result = await query(
    `
    ${kitchenItemSelect}
    WHERE ${statusFilter}
    ORDER BY
      urgency_rank ASC,
      oi.added_at ASC,
      oi.order_item_id ASC
    `,
    params,
  );

  return result.rows.map(mapKitchenItem);
};

const updateItemStatusInternal = async ({
  itemId,
  nextStatus,
  actorUserId,
  actionKey,
  strictRole = true,
}) => {
  const statusUpdate = await withTransaction(async (client) => {
    const itemResult = await client.query(
      `
      SELECT
        order_item_id,
        order_id,
        kitchen_status_key,
        completed_at,
        served_at
      FROM order_items
      WHERE order_item_id = $1
      LIMIT 1
      FOR UPDATE
      `,
      [itemId],
    );
    const item = itemResult.rows[0];
    if (!item) {
      throw new AppError("Order item not found", 404);
    }

    if (strictRole && item.kitchen_status_key === "ready" && nextStatus === "served") {
      throw new AppError("Use waiter endpoint to mark served", 400);
    }

    const allowed = allowedKitchenTransitions[item.kitchen_status_key] || [];
    if (!allowed.includes(nextStatus)) {
      throw new AppError(
        `Invalid transition: ${item.kitchen_status_key} -> ${nextStatus}`,
        400,
      );
    }

    const updateResult = await client.query(
      `
      UPDATE order_items
      SET
        kitchen_status_key = $1::varchar,
        completed_at = CASE
          WHEN $1::text = 'ready' THEN COALESCE(completed_at, NOW())
          ELSE completed_at
        END,
        served_at = CASE
          WHEN $1::text = 'served' THEN COALESCE(served_at, NOW())
          ELSE served_at
        END
      WHERE order_item_id = $2
      RETURNING
        order_item_id,
        order_id,
        kitchen_status_key,
        completed_at,
        served_at
      `,
      [nextStatus, itemId],
    );

    return {
      before: item,
      after: updateResult.rows[0],
    };
  });

  await writeAuditLog({
    actorUserId,
    actionKey,
    entityTypeKey: "order_items",
    entityId: itemId,
    beforeJson: statusUpdate.before,
    afterJson: statusUpdate.after,
  });

  const order = await syncOrderStatusFromItems(statusUpdate.after.order_id);
  await closeSessionIfDone(order.session_id);

  return getHydratedKitchenItemById(itemId);
};

export const updateKitchenItemStatus = async ({ itemId, nextStatus, actorUserId }) => {
  if (!["cooking", "ready", "cancelled"].includes(nextStatus)) {
    throw new AppError("Kitchen can set status to cooking, ready or cancelled only", 400);
  }

  return updateItemStatusInternal({
    itemId,
    nextStatus,
    actorUserId,
    actionKey: "kitchen_item.update_status",
    strictRole: true,
  });
};

export const markKitchenItemServed = async ({ itemId, actorUserId }) => {
  return updateItemStatusInternal({
    itemId,
    nextStatus: "served",
    actorUserId,
    actionKey: "kitchen_item.mark_served",
    strictRole: false,
  });
};
