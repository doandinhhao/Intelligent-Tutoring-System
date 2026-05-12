import { query, withTransaction } from "../database/db.js";
import { AppError } from "../helpers/errors.js";
import { writeAuditLog } from "./auditService.js";

const ACTIVE_SESSION_STATES = ["open", "service_completed", "awaiting_payment"];

const emptyKitchenSummary = () => ({
  pending_confirm: 0,
  new: 0,
  cooking: 0,
  ready: 0,
  served: 0,
  cancelled: 0,
  total: 0,
});

const buildKitchenSummaryMap = (rows) => {
  const bySession = new Map();

  for (const row of rows) {
    if (!bySession.has(row.session_id)) {
      bySession.set(row.session_id, emptyKitchenSummary());
    }
    const summary = bySession.get(row.session_id);
    const count = Number(row.count || 0);
    summary[row.kitchen_status_key] = (summary[row.kitchen_status_key] || 0) + count;
    summary.total += count;
  }

  return bySession;
};

const buildBillSummaryMap = (rows) => {
  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.session_id), {
      bill_id: Number(row.bill_id),
      bill_status_key: row.bill_status_key,
      payment_status_key: row.payment_status_key,
      total_amount: Number(row.total_amount || 0),
      paid_amount: Number(row.paid_amount || 0),
      opened_at: row.opened_at,
      closed_at: row.closed_at,
    });
  }
  return map;
};

export const listTablesWithState = async () => {
  const tablesResult = await query(
    `
    SELECT
      table_id::int AS table_id,
      table_code,
      area_key,
      capacity,
      current_status_key,
      is_active
    FROM dining_tables
    WHERE is_active = TRUE
    ORDER BY table_code ASC
    `,
  );

  const sessionsResult = await query(
    `
    SELECT DISTINCT ON (current_table_id)
      session_id::int AS session_id,
      current_table_id::int AS current_table_id,
      source_key,
      booking_status_key,
      session_status_key,
      customer_name,
      customer_phone,
      party_size::int AS party_size,
      requested_time,
      seated_at,
      ended_at,
      opened_by::int AS opened_by,
      notes,
      created_at
    FROM table_sessions
    WHERE session_status_key = ANY($1::text[])
    ORDER BY current_table_id ASC, created_at DESC
    `,
    [ACTIVE_SESSION_STATES],
  );

  const activeSessionByTableId = new Map(
    sessionsResult.rows.map((row) => [Number(row.current_table_id), row]),
  );

  const sessionIds = sessionsResult.rows.map((row) => Number(row.session_id));
  let summaryMap = new Map();
  let billSummaryMap = new Map();

  if (sessionIds.length > 0) {
    const [summaryResult, billResult] = await Promise.all([
      query(
        `
        SELECT
          o.session_id::int AS session_id,
          oi.kitchen_status_key,
          COUNT(*)::int AS count
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.order_id
        WHERE o.session_id = ANY($1::bigint[])
        GROUP BY o.session_id, oi.kitchen_status_key
        `,
        [sessionIds],
      ),
      query(
        `
        SELECT DISTINCT ON (session_id)
          bill_id::int AS bill_id,
          session_id::int AS session_id,
          bill_status_key,
          payment_status_key,
          total_amount::int AS total_amount,
          paid_amount::int AS paid_amount,
          opened_at,
          closed_at
        FROM bills
        WHERE session_id = ANY($1::bigint[])
        ORDER BY session_id ASC, opened_at DESC
        `,
        [sessionIds],
      ),
    ]);

    summaryMap = buildKitchenSummaryMap(summaryResult.rows);
    billSummaryMap = buildBillSummaryMap(billResult.rows);
  }

  return tablesResult.rows.map((table) => {
    const activeSession = activeSessionByTableId.get(Number(table.table_id)) || null;
    const kitchenSummary = activeSession
      ? summaryMap.get(Number(activeSession.session_id)) || emptyKitchenSummary()
      : emptyKitchenSummary();
    const billSummary = activeSession
      ? billSummaryMap.get(Number(activeSession.session_id)) || null
      : null;

    return {
      ...table,
      active_session: activeSession
        ? {
            ...activeSession,
            bill_summary: billSummary,
          }
        : null,
      kitchen_summary: kitchenSummary,
    };
  });
};

export const openTableSession = async ({
  tableId,
  customerName,
  customerPhone,
  partySize,
  notes,
  openedBy,
}) => {
  const session = await withTransaction(async (client) => {
    const tableResult = await client.query(
      `
      SELECT table_id, table_code, is_active, current_status_key
      FROM dining_tables
      WHERE table_id = $1
      FOR UPDATE
      `,
      [tableId],
    );
    const table = tableResult.rows[0];

    if (!table || !table.is_active) {
      throw new AppError("Table not found", 404);
    }
    if (table.current_status_key === "out_of_service") {
      throw new AppError("This table is out of service", 400);
    }

    const existingSessionResult = await client.query(
      `
      SELECT
        session_id::int AS session_id,
        current_table_id::int AS current_table_id,
        source_key,
        booking_status_key,
        session_status_key,
        customer_name,
        customer_phone,
        party_size::int AS party_size,
        requested_time,
        seated_at,
        ended_at,
        opened_by::int AS opened_by,
        notes,
        created_at
      FROM table_sessions
      WHERE current_table_id = $1
        AND session_status_key = ANY($2::text[])
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [tableId, ACTIVE_SESSION_STATES],
    );
    if (existingSessionResult.rows[0]) {
      return existingSessionResult.rows[0];
    }

    const insertResult = await client.query(
      `
      INSERT INTO table_sessions (
        current_table_id,
        source_key,
        booking_status_key,
        session_status_key,
        customer_name,
        customer_phone,
        party_size,
        requested_time,
        seated_at,
        ended_at,
        opened_by,
        notes,
        created_at
      )
      VALUES (
        $1,
        'walk_in',
        'seated',
        'open',
        $2,
        $3,
        $4,
        NOW(),
        NOW(),
        NULL,
        $5,
        $6,
        NOW()
      )
      RETURNING
        session_id::int AS session_id,
        current_table_id::int AS current_table_id,
        source_key,
        booking_status_key,
        session_status_key,
        customer_name,
        customer_phone,
        party_size::int AS party_size,
        requested_time,
        seated_at,
        ended_at,
        opened_by::int AS opened_by,
        notes,
        created_at
      `,
      [
        tableId,
        customerName?.trim() || "Walk-in Guest",
        customerPhone?.trim() || "",
        partySize || 2,
        openedBy,
        notes?.trim() || "",
      ],
    );

    await client.query(
      "UPDATE dining_tables SET current_status_key = 'occupied' WHERE table_id = $1",
      [tableId],
    );

    return insertResult.rows[0];
  });

  await writeAuditLog({
    actorUserId: openedBy,
    actionKey: "table_session.open",
    entityTypeKey: "table_sessions",
    entityId: session.session_id,
    afterJson: session,
  });

  return session;
};

export const getSessionById = async (sessionId) => {
  const result = await query(
    `
    SELECT
      session_id::int AS session_id,
      current_table_id::int AS current_table_id,
      source_key,
      booking_status_key,
      session_status_key,
      customer_name,
      customer_phone,
      party_size::int AS party_size,
      requested_time,
      seated_at,
      ended_at,
      opened_by::int AS opened_by,
      notes,
      created_at
    FROM table_sessions
    WHERE session_id = $1
    LIMIT 1
    `,
    [sessionId],
  );

  const session = result.rows[0];
  if (!session) {
    throw new AppError("Session not found", 404);
  }
  return session;
};

export const closeSessionIfDone = async (sessionId) => {
  const sessionResult = await query(
    `
    SELECT session_id::int AS session_id, current_table_id::int AS current_table_id, session_status_key
    FROM table_sessions
    WHERE session_id = $1
    LIMIT 1
    `,
    [sessionId],
  );
  const session = sessionResult.rows[0];

  if (!session || ["awaiting_payment", "closed"].includes(session.session_status_key)) {
    return;
  }

  const activeOrdersResult = await query(
    `
    SELECT COUNT(*)::int AS count
    FROM orders
    WHERE session_id = $1
      AND order_status_key = ANY($2::text[])
    `,
    [sessionId, ["draft", "confirmed", "in_progress", "ready_to_serve"]],
  );

  const activeCount = Number(activeOrdersResult.rows[0]?.count || 0);
  if (activeCount > 0) {
    return;
  }

  await query(
    `
    UPDATE table_sessions
    SET session_status_key = 'service_completed'
    WHERE session_id = $1
      AND session_status_key = 'open'
    `,
    [sessionId],
  );
};

export const inviteSessionForPayment = async ({ sessionId, invitedBy }) => {
  const result = await withTransaction(async (client) => {
    const sessionResult = await client.query(
      `
      SELECT
        session_id::int AS session_id,
        current_table_id::int AS current_table_id,
        session_status_key,
        ended_at
      FROM table_sessions
      WHERE session_id = $1
      LIMIT 1
      FOR UPDATE
      `,
      [sessionId],
    );
    const session = sessionResult.rows[0];
    if (!session) {
      throw new AppError("Session not found", 404);
    }
    if (session.session_status_key === "closed") {
      throw new AppError("Session is already closed", 400);
    }
    if (session.session_status_key === "awaiting_payment") {
      return session;
    }

    const activeOrdersResult = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM orders
      WHERE session_id = $1
        AND order_status_key = ANY($2::text[])
      `,
      [sessionId, ["draft", "confirmed", "in_progress", "ready_to_serve"]],
    );
    const activeCount = Number(activeOrdersResult.rows[0]?.count || 0);
    if (activeCount > 0) {
      throw new AppError(
        "Cannot invite payment yet. Some items are still in ordering/kitchen flow.",
        409,
      );
    }

    const sentOrderResult = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM orders
      WHERE session_id = $1
        AND order_status_key <> 'draft'
      `,
      [sessionId],
    );
    const sentCount = Number(sentOrderResult.rows[0]?.count || 0);
    if (sentCount <= 0) {
      throw new AppError("No served order found for this session", 400);
    }

    const updatedResult = await client.query(
      `
      UPDATE table_sessions
      SET
        session_status_key = 'awaiting_payment',
        ended_at = COALESCE(ended_at, NOW())
      WHERE session_id = $1
      RETURNING
        session_id::int AS session_id,
        current_table_id::int AS current_table_id,
        session_status_key,
        ended_at
      `,
      [sessionId],
    );

    await client.query(
      "UPDATE dining_tables SET current_status_key = 'occupied' WHERE table_id = $1",
      [session.current_table_id],
    );

    return updatedResult.rows[0];
  });

  await writeAuditLog({
    actorUserId: invitedBy,
    actionKey: "table_session.invite_payment",
    entityTypeKey: "table_sessions",
    entityId: result.session_id,
    afterJson: result,
  });

  return result;
};
