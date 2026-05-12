import { Router } from "express";
import {
  inviteSessionForPaymentHandler,
  listTablesHandler,
  openTableSessionHandler,
} from "../controllers/tableController.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth, requireRoles } from "../middlewares/authMiddleware.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireRoles("waiter", "chef", "manager", "cashier", "host", "admin"),
  asyncHandler(listTablesHandler),
);

router.post(
  "/sessions",
  requireAuth,
  requireRoles("waiter", "manager", "admin"),
  asyncHandler(openTableSessionHandler),
);

router.patch(
  "/sessions/:sessionId/invite-payment",
  requireAuth,
  requireRoles("waiter", "manager", "admin"),
  asyncHandler(inviteSessionForPaymentHandler),
);

export default router;
