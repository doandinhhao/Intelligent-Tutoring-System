import { Router } from "express";
import {
  createAdminMenuItemHandler,
  createAdminUserHandler,
  createPromotionHandler,
  listAdminMenuItemsHandler,
  listAdminUsersHandler,
  listAuditLogsHandler,
  listPromotionsHandler,
  updateAdminMenuItemHandler,
  updateAdminUserHandler,
  updatePromotionHandler,
} from "../controllers/adminController.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth, requireRoles } from "../middlewares/authMiddleware.js";

const router = Router();

router.use(requireAuth);
router.use(requireRoles("manager", "admin"));

router.get("/users", asyncHandler(listAdminUsersHandler));
router.post("/users", asyncHandler(createAdminUserHandler));
router.patch("/users/:userId", asyncHandler(updateAdminUserHandler));

router.get("/menu", asyncHandler(listAdminMenuItemsHandler));
router.post("/menu", asyncHandler(createAdminMenuItemHandler));
router.patch("/menu/:menuItemId", asyncHandler(updateAdminMenuItemHandler));

router.get("/promotions", asyncHandler(listPromotionsHandler));
router.post("/promotions", asyncHandler(createPromotionHandler));
router.patch("/promotions/:promotionId", asyncHandler(updatePromotionHandler));

router.get("/audit-logs", asyncHandler(listAuditLogsHandler));

export default router;
