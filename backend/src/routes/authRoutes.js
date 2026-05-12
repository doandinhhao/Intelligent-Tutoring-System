import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireAuth } from "../middlewares/authMiddleware.js";
import { loginHandler, meHandler } from "../controllers/authController.js";

const router = Router();

router.post("/login", asyncHandler(loginHandler));
router.get("/me", requireAuth, asyncHandler(meHandler));

export default router;

