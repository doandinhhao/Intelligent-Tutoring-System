import { query, withTransaction } from "../database/db.js";
import { AppError } from "../helpers/errors.js";
import { writeAuditLog } from "./auditService.js";

const ACTIVE_ORDER_STATUSES = ["draft", "confirmed", "in_progress", "ready_to_serve"];
const SUPPORTED_PAYMENT_METHODS = ["cash", "card", "digital_wallet"];

const roundMoney = (value) => Math.max(0, Math.round(Number(value) || 0));

const mapBill = (row) => ({
  ...row,
  bill_id: Number(row.bill_id),
  session_id: Number(row.session_id),
  parent_bill_id: row.parent_bill_id === null ? null : Number(row.parent_bill_id),
  subtotal_amount: Number(row.subtotal_amount || 0),
  discount_amount: Number(row.discount_amount || 0),
  service_charge_amount: Number(row.service_charge_amount || 0),
  tax_amount: Number(row.tax_amount || 0),
  tip_amount: Number(row.tip_amount || 0),
  total_amount: Number(row.total_amount || 0),
  split_count: Number(row.split_count || 1),
  paid_amount: Number(row.paid_amount || 0),
  refund_amount: Number(row.refund_amount || 0),
  opened_by: Number(row.opened_by),
  closed_by: row.closed_by === null ? null : Number(row.closed_by),
});

const getSessionByIdForBilling = async (sessionId, runner = query) => {
  const result = await runner(
    `
    SELECT
      ts.session_id::int AS session_id,
      ts.current_table_id::int AS current_table_id,
      ts.session_status_key,
      ts.customer_name,
      ts.customer_phone,
      ts.party_size::int AS party_size,
      ts.seated_at,
      ts.ended_at,
      dt.table_code,
      dt.current_status_key
    FROM table_sessions ts
    JOIN dining_tables dt ON dt.table_id = ts.current_table_id
    WHERE ts.session_id = $1
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

const getLatestBillBySession = async (sessionId) => {
  const result = await query(
    `
    SELECT
      bill_id::int AS bill_id,
      session_id::int AS session_id,
      parent_bill_id::int AS parent_bill_id,
      bill_status_key,
      subtotal_amount::int AS subtotal_amount,
      discount_amount::int AS discount_amount,
      service_charge_amount::int AS service_charge_amount,
      tax_amount::int AS tax_amount,
      tip_amount::int AS tip_amount,
      total_amount::int AS total_amount,
      split_count::int AS split_count,
      payment_method_key,
      payment_status_key,
      paid_amount::int AS paid_amount,
      paid_at,
      external_txn_id,
      refund_amount::int AS refund_amount,
      refund_reason,
      adjustment_reason,
      applied_discount_json,
      receipt_url,
      opened_by::int AS opened_by,
      closed_by::int AS closed_by,
      opened_at,
      closed_at
    FROM bills
    WHERE session_id = $1
    ORDER BY opened_at DESC, bill_id DESC
    LIMIT 1
    `,
    [sessionId],
  );

  return result.rows[0] ? mapBill(result.rows[0]) : null;
};

const getBillById = async (billId, runner = query) => {
  const result = await runner(
    `
    SELECT
      bill_id::int AS bill_id,
      session_id::int AS session_id,
      parent_bill_id::int AS parent_bill_id,
      bill_status_key,
      subtotal_amount::int AS subtotal_amount,
      discount_amount::int AS discount_amount,
      service_charge_amount::int AS service_charge_amount,
      tax_amount::int AS tax_amount,
      tip_amount::int AS tip_amount,
      total_amount::int AS total_amount,
      split_count::int AS split_count,
      payment_method_key,
      payment_status_key,
      paid_amount::int AS paid_amount,
      paid_at,
      external_txn_id,
      refund_amount::int AS refund_amount,
      refund_reason,
      adjustment_reason,
      applied_discount_json,
      receipt_url,
      opened_by::int AS opened_by,
      closed_by::int AS closed_by,
      opened_at,
      closed_at
    FROM bills
    WHERE bill_id = $1
    LIMIT 1
    `,
    [billId],
  );

  if (!result.rows[0]) {
    throw new AppError("Bill not found", 404);
  }

  return mapBill(result.rows[0]);
};

const listBillLinesBySession = async (sessionId, runner = query) => {
  const result = await runner(
    `
    SELECT
      oi.order_item_id::int AS order_item_id,
      o.order_no,
      oi.item_name_snapshot,
      oi.quantity::int AS quantity,
      oi.unit_price_snapshot::int AS unit_price_snapshot,
      oi.line_subtotal::int AS line_subtotal,
      oi.kitchen_status_key
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.order_id
    WHERE o.session_id = $1
      AND o.order_status_key <> 'draft'
      AND oi.kitchen_status_key <> 'cancelled'
    ORDER BY oi.added_at ASC, oi.order_item_id ASC
    `,
    [sessionId],
  );

  return result.rows.map((line) => ({
    ...line,
    order_item_id: Number(line.order_item_id),
    quantity: Number(line.quantity || 0),
    unit_price_snapshot: Number(line.unit_price_snapshot || 0),
    line_subtotal: Number(line.line_subtotal || 0),
  }));
};

const computeSubtotalForSession = async (sessionId, runner = query) => {
  const result = await runner(
    `
    SELECT COALESCE(SUM(oi.line_subtotal), 0)::int AS subtotal
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.order_id
    WHERE o.session_id = $1
      AND o.order_status_key <> 'draft'
      AND oi.kitchen_status_key <> 'cancelled'
    `,
    [sessionId],
  );
  return Number(result.rows[0]?.subtotal || 0);
};

const ensureSessionBillable = async (sessionId, runner = query) => {
  const pendingResult = await runner(
    `
    SELECT COUNT(*)::int AS count
    FROM orders
    WHERE session_id = $1
      AND order_status_key = ANY($2::text[])
    `,
    [sessionId, ACTIVE_ORDER_STATUSES],
  );

  const pendingCount = Number(pendingResult.rows[0]?.count || 0);
  if (pendingCount > 0) {
    throw new AppError("Cannot bill yet. Some order items are still in service flow.", 409);
  }
};

const getActivePromotionByCode = async (promotionCode, runner = query) => {
  if (!promotionCode) {
    return null;
  }

  const result = await runner(
    `
    SELECT
      promotion_id::int AS promotion_id,
      promotion_code,
      promotion_name,
      discount_type_key,
      discount_value::int AS discount_value,
      max_discount_amount::int AS max_discount_amount,
      min_order_amount::int AS min_order_amount,
      is_active,
      start_at,
      end_at
    FROM promotions
    WHERE UPPER(promotion_code) = UPPER($1)
      AND is_active = TRUE
      AND (start_at IS NULL OR start_at <= NOW())
      AND (end_at IS NULL OR end_at >= NOW())
    LIMIT 1
    `,
    [promotionCode],
  );

  return result.rows[0] || null;
};

const computeTotals = ({
  subtotal,
  manualDiscountAmount = 0,
  serviceChargeRate = 5,
  taxRate = 8,
  tipAmount = 0,
  splitCount = 1,
  promotion = null,
}) => {
  const baseSubtotal = roundMoney(subtotal);
  const normalizedSplit = Math.min(20, Math.max(1, Number(splitCount) || 1));
  const manualDiscount = roundMoney(manualDiscountAmount);
  const safeTip = roundMoney(tipAmount);

  let promotionDiscount = 0;
  if (promotion) {
    if (promotion.discount_type_key === "percent") {
      promotionDiscount = roundMoney((baseSubtotal * Number(promotion.discount_value || 0)) / 100);
      if (promotion.max_discount_amount) {
        promotionDiscount = Math.min(promotionDiscount, Number(promotion.max_discount_amount));
      }
    } else {
      promotionDiscount = roundMoney(promotion.discount_value);
    }
  }

  const discountAmount = Math.min(baseSubtotal, manualDiscount + promotionDiscount);
  const taxableBase = Math.max(0, baseSubtotal - discountAmount);
  const serviceChargeAmount = roundMoney((taxableBase * Number(serviceChargeRate || 0)) / 100);
  const taxAmount = roundMoney(((taxableBase + serviceChargeAmount) * Number(taxRate || 0)) / 100);
  const totalAmount = roundMoney(taxableBase + serviceChargeAmount + taxAmount + safeTip);
  const perSplitAmount = roundMoney(totalAmount / normalizedSplit);

  return {
    subtotal_amount: baseSubtotal,
    discount_amount: discountAmount,
    service_charge_amount: serviceChargeAmount,
    tax_amount: taxAmount,
    tip_amount: safeTip,
    total_amount: totalAmount,
    split_count: normalizedSplit,
    per_split_amount: perSplitAmount,
    applied_discount_json: {
      manual_discount_amount: manualDiscount,
      promotion: promotion
        ? {
            promotion_id: Number(promotion.promotion_id),
            promotion_code: promotion.promotion_code,
            promotion_name: promotion.promotion_name,
            discount_type_key: promotion.discount_type_key,
            discount_value: Number(promotion.discount_value || 0),
            effective_discount_amount: promotionDiscount,
          }
        : null,
      service_charge_rate: Number(serviceChargeRate || 0),
      tax_rate: Number(taxRate || 0),
    },
  };
};

const hydrateBill = async (bill, runner = query) => {
  const [session, lines] = await Promise.all([
    getSessionByIdForBilling(bill.session_id, runner),
    listBillLinesBySession(bill.session_id, runner),
  ]);

  return {
    ...bill,
    session,
    lines,
    split_preview: Array.from({ length: bill.split_count }).map((_item, index) => ({
      part_no: index + 1,
      amount: roundMoney(bill.total_amount / bill.split_count),
    })),
  };
};

export const getBillDetail = async (billId) => {
  const bill = await getBillById(billId);
  return hydrateBill(bill);
};

export const getLatestSessionBill = async (sessionId) => {
  await getSessionByIdForBilling(sessionId);
  const bill = await getLatestBillBySession(sessionId);
  if (!bill) {
    return null;
  }
  return hydrateBill(bill);
};

export const openBillForSession = async ({
  sessionId,
  openedBy,
  manualDiscountAmount = 0,
  serviceChargeRate = 5,
  taxRate = 8,
  tipAmount = 0,
  splitCount = 1,
  promotionCode = "",
  adjustmentReason = "",
}) => {
  const normalizedReason = adjustmentReason?.trim() || "";

  const openedBillId = await withTransaction(async (client) => {
    const session = await getSessionByIdForBilling(sessionId, client.query.bind(client));
    if (session.session_status_key !== "awaiting_payment") {
      throw new AppError(
        "Session is not waiting for payment yet. Waiter must invite payment first.",
        409,
      );
    }
    await ensureSessionBillable(sessionId, client.query.bind(client));

    const existingOpenBillResult = await client.query(
      `
      SELECT bill_id::int AS bill_id
      FROM bills
      WHERE session_id = $1
        AND bill_status_key = 'open'
      ORDER BY opened_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [sessionId],
    );
    if (existingOpenBillResult.rows[0]) {
      return Number(existingOpenBillResult.rows[0].bill_id);
    }

    const subtotal = await computeSubtotalForSession(sessionId, client.query.bind(client));
    if (subtotal <= 0) {
      throw new AppError("No billable items found for this session", 400);
    }

    const promotion = await getActivePromotionByCode(
      promotionCode?.trim(),
      client.query.bind(client),
    );
    if (promotion && subtotal < Number(promotion.min_order_amount || 0)) {
      throw new AppError(
        `Promotion ${promotion.promotion_code} requires minimum order ${promotion.min_order_amount}`,
        400,
      );
    }
    if (promotionCode && !promotion) {
      throw new AppError("Promotion code is invalid or inactive", 400);
    }

    const totals = computeTotals({
      subtotal,
      manualDiscountAmount,
      serviceChargeRate,
      taxRate,
      tipAmount,
      splitCount,
      promotion,
    });

    const inserted = await client.query(
      `
      INSERT INTO bills (
        session_id,
        parent_bill_id,
        bill_status_key,
        subtotal_amount,
        discount_amount,
        service_charge_amount,
        tax_amount,
        tip_amount,
        total_amount,
        split_count,
        payment_method_key,
        payment_status_key,
        paid_amount,
        paid_at,
        external_txn_id,
        refund_amount,
        refund_reason,
        adjustment_reason,
        applied_discount_json,
        receipt_url,
        opened_by,
        closed_by,
        opened_at,
        closed_at
      )
      VALUES (
        $1,
        NULL,
        'open',
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        NULL,
        'unpaid',
        0,
        NULL,
        NULL,
        0,
        '',
        $9,
        $10::jsonb,
        $11,
        $12,
        NULL,
        NOW(),
        NULL
      )
      RETURNING bill_id::int AS bill_id
      `,
      [
        sessionId,
        totals.subtotal_amount,
        totals.discount_amount,
        totals.service_charge_amount,
        totals.tax_amount,
        totals.tip_amount,
        totals.total_amount,
        totals.split_count,
        normalizedReason,
        JSON.stringify(totals.applied_discount_json),
        `/api/billing/receipt/session-${sessionId}`,
        openedBy,
      ],
    );

    return Number(inserted.rows[0].bill_id);
  });

  const bill = await getBillDetail(openedBillId);

  await writeAuditLog({
    actorUserId: openedBy,
    actionKey: "bill.open",
    entityTypeKey: "bills",
    entityId: openedBillId,
    afterJson: bill,
  });

  if (bill.discount_amount > 0) {
    await writeAuditLog({
      actorUserId: openedBy,
      actionKey: "bill.discount_override",
      entityTypeKey: "bills",
      entityId: openedBillId,
      reason: normalizedReason || "discount applied during bill opening",
      afterJson: {
        discount_amount: bill.discount_amount,
        applied_discount_json: bill.applied_discount_json,
      },
    });
  }

  return bill;
};

export const adjustBill = async ({
  billId,
  adjustedBy,
  manualDiscountAmount,
  serviceChargeRate,
  taxRate,
  tipAmount,
  splitCount,
  promotionCode,
  adjustmentReason,
}) => {
  const reason = adjustmentReason?.trim() || "";
  if (!reason) {
    throw new AppError("Adjustment reason is required", 400);
  }

  const before = await getBillById(billId);
  if (before.bill_status_key !== "open") {
    throw new AppError("Only open bill can be adjusted", 400);
  }

  const subtotal = before.subtotal_amount;
  const promotion = await getActivePromotionByCode(promotionCode?.trim());
  if (promotionCode && !promotion) {
    throw new AppError("Promotion code is invalid or inactive", 400);
  }
  if (promotion && subtotal < Number(promotion.min_order_amount || 0)) {
    throw new AppError(
      `Promotion ${promotion.promotion_code} requires minimum order ${promotion.min_order_amount}`,
      400,
    );
  }

  const totals = computeTotals({
    subtotal,
    manualDiscountAmount,
    serviceChargeRate,
    taxRate,
    tipAmount,
    splitCount,
    promotion,
  });

  const updated = await withTransaction(async (client) => {
    const lockResult = await client.query(
      `
      SELECT bill_id, bill_status_key
      FROM bills
      WHERE bill_id = $1
      LIMIT 1
      FOR UPDATE
      `,
      [billId],
    );
    const locked = lockResult.rows[0];
    if (!locked) {
      throw new AppError("Bill not found", 404);
    }
    if (locked.bill_status_key !== "open") {
      throw new AppError("Only open bill can be adjusted", 400);
    }

    const result = await client.query(
      `
      UPDATE bills
      SET
        discount_amount = $1,
        service_charge_amount = $2,
        tax_amount = $3,
        tip_amount = $4,
        total_amount = $5,
        split_count = $6,
        applied_discount_json = $7::jsonb,
        adjustment_reason = $8
      WHERE bill_id = $9
      RETURNING bill_id::int AS bill_id
      `,
      [
        totals.discount_amount,
        totals.service_charge_amount,
        totals.tax_amount,
        totals.tip_amount,
        totals.total_amount,
        totals.split_count,
        JSON.stringify(totals.applied_discount_json),
        reason,
        billId,
      ],
    );

    return Number(result.rows[0].bill_id);
  });

  const bill = await getBillDetail(updated);

  await writeAuditLog({
    actorUserId: adjustedBy,
    actionKey: "bill.manual_price_adjustment",
    entityTypeKey: "bills",
    entityId: bill.bill_id,
    reason,
    beforeJson: before,
    afterJson: bill,
  });

  if (bill.discount_amount !== before.discount_amount) {
    await writeAuditLog({
      actorUserId: adjustedBy,
      actionKey: "bill.discount_override",
      entityTypeKey: "bills",
      entityId: bill.bill_id,
      reason,
      beforeJson: { discount_amount: before.discount_amount },
      afterJson: {
        discount_amount: bill.discount_amount,
        applied_discount_json: bill.applied_discount_json,
      },
    });
  }

  return bill;
};

export const payBill = async ({
  billId,
  paidBy,
  paymentMethod,
  paidAmount,
  externalTxnId,
}) => {
  if (!SUPPORTED_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new AppError("Unsupported payment method", 400);
  }

  const outcome = await withTransaction(async (client) => {
    const current = await getBillById(billId, client.query.bind(client));
    if (current.bill_status_key !== "open") {
      throw new AppError("Only open bill can be paid", 400);
    }

    const payValue = roundMoney(
      paidAmount === undefined || paidAmount === null ? current.total_amount : paidAmount,
    );
    if (payValue <= 0) {
      throw new AppError("Paid amount must be greater than 0", 400);
    }

    const totalPaid = Math.min(current.total_amount, roundMoney(current.paid_amount + payValue));
    const isFullyPaid = totalPaid >= current.total_amount;
    const paymentStatus = isFullyPaid ? "paid" : "partial";
    const billStatus = isFullyPaid ? "paid" : "open";

    await client.query(
      `
      UPDATE bills
      SET
        payment_method_key = $1,
        payment_status_key = $2,
        bill_status_key = $3,
        paid_amount = $4,
        paid_at = CASE WHEN $5::boolean = TRUE THEN NOW() ELSE paid_at END,
        external_txn_id = COALESCE($6, external_txn_id),
        closed_by = CASE WHEN $5::boolean = TRUE THEN $7 ELSE closed_by END,
        closed_at = CASE WHEN $5::boolean = TRUE THEN NOW() ELSE closed_at END
      WHERE bill_id = $8
      `,
      [
        paymentMethod,
        paymentStatus,
        billStatus,
        totalPaid,
        isFullyPaid,
        externalTxnId?.trim() || null,
        isFullyPaid ? paidBy : null,
        billId,
      ],
    );

    if (isFullyPaid) {
      await client.query(
        `
        UPDATE table_sessions
        SET session_status_key = 'closed', ended_at = COALESCE(ended_at, NOW())
        WHERE session_id = $1
        `,
        [current.session_id],
      );

      await client.query(
        `
        UPDATE dining_tables
        SET current_status_key = 'cleaning'
        WHERE table_id = (
          SELECT current_table_id
          FROM table_sessions
          WHERE session_id = $1
          LIMIT 1
        )
        `,
        [current.session_id],
      );
    }

    return { billId: current.bill_id, isFullyPaid };
  });

  const bill = await getBillDetail(outcome.billId);

  await writeAuditLog({
    actorUserId: paidBy,
    actionKey: "bill.pay",
    entityTypeKey: "bills",
    entityId: bill.bill_id,
    afterJson: bill,
  });

  return bill;
};

export const voidBill = async ({ billId, actorUserId, reason }) => {
  const normalizedReason = reason?.trim() || "";
  if (!normalizedReason) {
    throw new AppError("Void reason is required", 400);
  }

  const before = await getBillById(billId);
  if (before.bill_status_key !== "open") {
    throw new AppError("Only open bill can be voided", 400);
  }
  if (before.paid_amount > 0) {
    throw new AppError("Use refund for paid bill", 400);
  }

  await query(
    `
    UPDATE bills
    SET
      bill_status_key = 'void',
      payment_status_key = 'void',
      closed_by = $1,
      closed_at = NOW(),
      adjustment_reason = $2
    WHERE bill_id = $3
    `,
    [actorUserId, normalizedReason, billId],
  );

  const bill = await getBillDetail(billId);

  await writeAuditLog({
    actorUserId,
    actionKey: "bill.void",
    entityTypeKey: "bills",
    entityId: bill.bill_id,
    reason: normalizedReason,
    beforeJson: before,
    afterJson: bill,
  });

  return bill;
};

export const refundBill = async ({ billId, actorUserId, refundAmount, refundReason }) => {
  const normalizedReason = refundReason?.trim() || "";
  if (!normalizedReason) {
    throw new AppError("Refund reason is required", 400);
  }

  const before = await getBillById(billId);
  if (before.bill_status_key !== "paid") {
    throw new AppError("Only paid bill can be refunded", 400);
  }

  const amount = roundMoney(refundAmount || before.paid_amount);
  if (amount <= 0 || amount > before.paid_amount) {
    throw new AppError("Refund amount is invalid", 400);
  }

  await query(
    `
    UPDATE bills
    SET
      bill_status_key = 'refunded',
      payment_status_key = 'refunded',
      refund_amount = $1,
      refund_reason = $2,
      closed_by = $3,
      closed_at = NOW()
    WHERE bill_id = $4
    `,
    [amount, normalizedReason, actorUserId, billId],
  );

  const bill = await getBillDetail(billId);

  await writeAuditLog({
    actorUserId,
    actionKey: "bill.refund",
    entityTypeKey: "bills",
    entityId: bill.bill_id,
    reason: normalizedReason,
    beforeJson: before,
    afterJson: bill,
  });

  return bill;
};

export const getBillReceipt = async (billId) => {
  const bill = await getBillDetail(billId);
  const session = bill.session;

  const lines = bill.lines.map(
    (line) =>
      `${line.quantity} x ${line.item_name_snapshot} ........ ${line.line_subtotal.toLocaleString("vi-VN")} d`,
  );

  const receiptText = [
    `BepNhip IRMS - Bill #${bill.bill_id}`,
    `Table: ${session.table_code} | Guest: ${session.customer_name}`,
    `Opened: ${new Date(bill.opened_at).toLocaleString("vi-VN")}`,
    "",
    ...lines,
    "",
    `Subtotal: ${bill.subtotal_amount.toLocaleString("vi-VN")} d`,
    `Discount: -${bill.discount_amount.toLocaleString("vi-VN")} d`,
    `Service: ${bill.service_charge_amount.toLocaleString("vi-VN")} d`,
    `Tax: ${bill.tax_amount.toLocaleString("vi-VN")} d`,
    `Tip: ${bill.tip_amount.toLocaleString("vi-VN")} d`,
    `Total: ${bill.total_amount.toLocaleString("vi-VN")} d`,
    `Paid: ${bill.paid_amount.toLocaleString("vi-VN")} d`,
    `Payment: ${bill.payment_method_key || "N/A"} | Status: ${bill.payment_status_key}`,
  ].join("\n");

  return {
    bill_id: bill.bill_id,
    receipt_text: receiptText,
    receipt_url: bill.receipt_url,
    generated_at: new Date().toISOString(),
  };
};
