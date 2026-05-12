import { z } from "zod";
import { created, ok } from "../helpers/http.js";
import {
  adjustBill,
  getBillDetail,
  getBillReceipt,
  getLatestSessionBill,
  openBillForSession,
  payBill,
  refundBill,
  voidBill,
} from "../services/billingService.js";

const sessionParamSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
});

const billParamSchema = z.object({
  billId: z.coerce.number().int().positive(),
});

const openBillSchema = z.object({
  manual_discount_amount: z.coerce.number().min(0).optional(),
  service_charge_rate: z.coerce.number().min(0).max(50).optional(),
  tax_rate: z.coerce.number().min(0).max(50).optional(),
  tip_amount: z.coerce.number().min(0).optional(),
  split_count: z.coerce.number().int().min(1).max(20).optional(),
  promotion_code: z.string().trim().max(50).optional(),
  adjustment_reason: z.string().trim().max(255).optional(),
});

const adjustBillSchema = z.object({
  manual_discount_amount: z.coerce.number().min(0),
  service_charge_rate: z.coerce.number().min(0).max(50),
  tax_rate: z.coerce.number().min(0).max(50),
  tip_amount: z.coerce.number().min(0),
  split_count: z.coerce.number().int().min(1).max(20),
  promotion_code: z.string().trim().max(50).optional(),
  adjustment_reason: z.string().trim().min(2).max(255),
});

const payBillSchema = z.object({
  payment_method: z.enum(["cash", "card", "digital_wallet"]),
  paid_amount: z.coerce.number().min(0).optional(),
  external_txn_id: z.string().trim().max(100).optional(),
});

const voidBillSchema = z.object({
  reason: z.string().trim().min(2).max(255),
});

const refundBillSchema = z.object({
  refund_amount: z.coerce.number().min(0).optional(),
  refund_reason: z.string().trim().min(2).max(255),
});

export const getLatestSessionBillHandler = async (req, res) => {
  const { sessionId } = sessionParamSchema.parse(req.params);
  const bill = await getLatestSessionBill(sessionId);
  return ok(res, bill);
};

export const openSessionBillHandler = async (req, res) => {
  const { sessionId } = sessionParamSchema.parse(req.params);
  const payload = openBillSchema.parse(req.body || {});
  const bill = await openBillForSession({
    sessionId,
    openedBy: req.user.user_id,
    manualDiscountAmount: payload.manual_discount_amount,
    serviceChargeRate: payload.service_charge_rate,
    taxRate: payload.tax_rate,
    tipAmount: payload.tip_amount,
    splitCount: payload.split_count,
    promotionCode: payload.promotion_code,
    adjustmentReason: payload.adjustment_reason,
  });
  return created(res, bill, "Bill opened");
};

export const getBillDetailHandler = async (req, res) => {
  const { billId } = billParamSchema.parse(req.params);
  const bill = await getBillDetail(billId);
  return ok(res, bill);
};

export const adjustBillHandler = async (req, res) => {
  const { billId } = billParamSchema.parse(req.params);
  const payload = adjustBillSchema.parse(req.body);
  const bill = await adjustBill({
    billId,
    adjustedBy: req.user.user_id,
    manualDiscountAmount: payload.manual_discount_amount,
    serviceChargeRate: payload.service_charge_rate,
    taxRate: payload.tax_rate,
    tipAmount: payload.tip_amount,
    splitCount: payload.split_count,
    promotionCode: payload.promotion_code,
    adjustmentReason: payload.adjustment_reason,
  });
  return ok(res, bill, "Bill adjusted");
};

export const payBillHandler = async (req, res) => {
  const { billId } = billParamSchema.parse(req.params);
  const payload = payBillSchema.parse(req.body);
  const bill = await payBill({
    billId,
    paidBy: req.user.user_id,
    paymentMethod: payload.payment_method,
    paidAmount: payload.paid_amount,
    externalTxnId: payload.external_txn_id,
  });
  return ok(res, bill, "Payment recorded");
};

export const voidBillHandler = async (req, res) => {
  const { billId } = billParamSchema.parse(req.params);
  const payload = voidBillSchema.parse(req.body);
  const bill = await voidBill({
    billId,
    actorUserId: req.user.user_id,
    reason: payload.reason,
  });
  return ok(res, bill, "Bill voided");
};

export const refundBillHandler = async (req, res) => {
  const { billId } = billParamSchema.parse(req.params);
  const payload = refundBillSchema.parse(req.body);
  const bill = await refundBill({
    billId,
    actorUserId: req.user.user_id,
    refundAmount: payload.refund_amount,
    refundReason: payload.refund_reason,
  });
  return ok(res, bill, "Bill refunded");
};

export const getBillReceiptHandler = async (req, res) => {
  const { billId } = billParamSchema.parse(req.params);
  const receipt = await getBillReceipt(billId);
  return ok(res, receipt);
};
