import { Router } from "express";
import {
  getKitchenChangeRequestsHandler,
  getKitchenItemsHandler,
  markKitchenItemServedHandler,
  reviewKitchenChangeRequestHandler,
  updateKitchenItemStatusHandler,
} from "../controllers/kitchenController.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth, requireRoles } from "../middlewares/authMiddleware.js";

const router = Router();

router.get(
  "/items",
  requireAuth,
  requireRoles("chef", "waiter", "manager", "admin"),
  asyncHandler(getKitchenItemsHandler),
);

router.patch(
  "/items/:itemId/status",
  requireAuth,
  requireRoles("chef", "manager", "admin"),
  asyncHandler(updateKitchenItemStatusHandler),
);

router.patch(
  "/items/:itemId/served",
  requireAuth,
  requireRoles("waiter", "manager", "admin"),
  asyncHandler(markKitchenItemServedHandler),
);

router.get(
  "/change-requests",
  requireAuth,
  requireRoles("chef", "manager", "admin"),
  asyncHandler(getKitchenChangeRequestsHandler),
);

router.patch(
  "/change-requests/:requestId/review",
  requireAuth,
  requireRoles("chef", "manager", "admin"),
  asyncHandler(reviewKitchenChangeRequestHandler),
);

export default router;
