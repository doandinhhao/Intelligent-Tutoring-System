import { Router } from "express";
import {
  addOrderItemHandler,
  confirmOrderHandler,
  createOrderItemChangeRequestHandler,
  createDraftOrderHandler,
  getActiveOrderBySessionHandler,
  listOrdersBySessionHandler,
  listOrderChangeRequestsHandler,
  getOrderDetailHandler,
  removeOrderItemHandler,
  updateOrderItemHandler,
} from "../controllers/orderController.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth, requireRoles } from "../middlewares/authMiddleware.js";

const router = Router();

router.get(
  "/sessions/:sessionId/orders",
  requireAuth,
  requireRoles("waiter", "chef", "manager", "admin"),
  asyncHandler(listOrdersBySessionHandler),
);

router.get(
  "/sessions/:sessionId/active",
  requireAuth,
  requireRoles("waiter", "manager", "admin"),
  asyncHandler(getActiveOrderBySessionHandler),
);

router.post(
  "/sessions/:sessionId/draft",
  requireAuth,
  requireRoles("waiter", "manager", "admin"),
  asyncHandler(createDraftOrderHandler),
);

router.get(
  "/:orderId",
  requireAuth,
  requireRoles("waiter", "chef", "manager", "admin"),
  asyncHandler(getOrderDetailHandler),
);

router.post(
  "/:orderId/items",
  requireAuth,
  requireRoles("waiter", "manager", "admin"),
  asyncHandler(addOrderItemHandler),
);

router.patch(
  "/:orderId/items/:itemId",
  requireAuth,
  requireRoles("waiter", "manager", "admin"),
  asyncHandler(updateOrderItemHandler),
);

router.delete(
  "/:orderId/items/:itemId",
  requireAuth,
  requireRoles("waiter", "manager", "admin"),
  asyncHandler(removeOrderItemHandler),
);

router.post(
  "/:orderId/confirm",
  requireAuth,
  requireRoles("waiter", "manager", "admin"),
  asyncHandler(confirmOrderHandler),
);

router.get(
  "/:orderId/change-requests",
  requireAuth,
  requireRoles("waiter", "chef", "manager", "admin"),
  asyncHandler(listOrderChangeRequestsHandler),
);

router.post(
  "/:orderId/items/:itemId/change-requests",
  requireAuth,
  requireRoles("waiter", "manager", "admin"),
  asyncHandler(createOrderItemChangeRequestHandler),
);

export default router;
