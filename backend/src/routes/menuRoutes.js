import { Router } from "express";
import { getMenuHandler } from "../controllers/menuController.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth, requireRoles } from "../middlewares/authMiddleware.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireRoles("waiter", "chef", "manager", "admin"),
  asyncHandler(getMenuHandler),
);

export default router;
