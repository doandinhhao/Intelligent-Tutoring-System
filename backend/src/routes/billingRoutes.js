import { Router } from "express";
import {
  adjustBillHandler,
  getBillDetailHandler,
  getBillReceiptHandler,
  getLatestSessionBillHandler,
  openSessionBillHandler,
  payBillHandler,
  refundBillHandler,
  voidBillHandler,
} from "../controllers/billingController.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth, requireRoles } from "../middlewares/authMiddleware.js";

const router = Router();

router.get(
  "/sessions/:sessionId/latest",
  requireAuth,
  requireRoles("waiter", "cashier", "host", "manager", "admin"),
  asyncHandler(getLatestSessionBillHandler),
);

router.post(
  "/sessions/:sessionId/open",
  requireAuth,
  requireRoles("waiter", "cashier", "host", "manager", "admin"),
  asyncHandler(openSessionBillHandler),
);

router.get(
  "/:billId",
  requireAuth,
  requireRoles("waiter", "cashier", "host", "manager", "admin"),
  asyncHandler(getBillDetailHandler),
);

router.patch(
  "/:billId/adjust",
  requireAuth,
  requireRoles("cashier", "manager", "admin"),
  asyncHandler(adjustBillHandler),
);

router.patch(
  "/:billId/pay",
  requireAuth,
  requireRoles("waiter", "cashier", "host", "manager", "admin"),
  asyncHandler(payBillHandler),
);

router.patch(
  "/:billId/void",
  requireAuth,
  requireRoles("cashier", "manager", "admin"),
  asyncHandler(voidBillHandler),
);

router.patch(
  "/:billId/refund",
  requireAuth,
  requireRoles("cashier", "manager", "admin"),
  asyncHandler(refundBillHandler),
);

router.get(
  "/:billId/receipt",
  requireAuth,
  requireRoles("waiter", "cashier", "host", "manager", "admin"),
  asyncHandler(getBillReceiptHandler),
);

export default router;
