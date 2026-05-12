import { z } from "zod";
import { created, ok } from "../helpers/http.js";
import {
  createAdminMenuItem,
  createAdminUser,
  createPromotion,
  listAdminMenuItems,
  listAdminUsers,
  listAuditLogs,
  listPromotions,
  updateAdminMenuItem,
  updateAdminUser,
  updatePromotion,
} from "../services/adminService.js";

const userQuerySchema = z.object({
  role: z.string().trim().optional(),
  status: z.string().trim().optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(100),
  full_name: z.string().trim().min(2).max(150),
  password: z.string().min(6).max(100),
  role_key: z.enum(["manager", "waiter", "chef", "cashier", "host", "admin"]),
});

const userParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

const updateUserSchema = z.object({
  full_name: z.string().trim().min(2).max(150).optional(),
  role_key: z.enum(["manager", "waiter", "chef", "cashier", "host", "admin"]).optional(),
  status_key: z.enum(["active", "locked"]).optional(),
  reset_password: z.string().min(6).max(100).optional(),
});

const createMenuSchema = z.object({
  item_name: z.string().trim().min(2).max(150),
  short_desc: z.string().trim().max(255).optional(),
  category_key: z.string().trim().min(2).max(50),
  item_type_key: z.string().trim().min(2).max(30),
  station_key: z.string().trim().min(2).max(30),
  availability_key: z.enum(["available", "unavailable"]).optional(),
  base_price: z.coerce.number().min(0),
  options_json: z.array(z.any()).optional(),
  recipe_json: z.array(z.any()).optional(),
});

const menuParamSchema = z.object({
  menuItemId: z.coerce.number().int().positive(),
});

const updateMenuSchema = z.object({
  item_name: z.string().trim().min(2).max(150).optional(),
  short_desc: z.string().trim().max(255).optional(),
  category_key: z.string().trim().min(2).max(50).optional(),
  item_type_key: z.string().trim().min(2).max(30).optional(),
  station_key: z.string().trim().min(2).max(30).optional(),
  availability_key: z.enum(["available", "unavailable"]).optional(),
  base_price: z.coerce.number().min(0).optional(),
  options_json: z.array(z.any()).optional(),
  recipe_json: z.array(z.any()).optional(),
});

const createPromotionSchema = z.object({
  promotion_code: z.string().trim().min(3).max(50),
  promotion_name: z.string().trim().min(2).max(150),
  discount_type_key: z.enum(["percent", "fixed"]),
  discount_value: z.coerce.number().min(0),
  max_discount_amount: z.coerce.number().min(0).optional().nullable(),
  min_order_amount: z.coerce.number().min(0).optional(),
  is_active: z.boolean().optional(),
  start_at: z.string().datetime().optional().nullable(),
  end_at: z.string().datetime().optional().nullable(),
});

const promotionParamSchema = z.object({
  promotionId: z.coerce.number().int().positive(),
});

const updatePromotionSchema = z.object({
  promotion_name: z.string().trim().min(2).max(150).optional(),
  discount_type_key: z.enum(["percent", "fixed"]).optional(),
  discount_value: z.coerce.number().min(0).optional(),
  max_discount_amount: z.coerce.number().min(0).optional().nullable(),
  min_order_amount: z.coerce.number().min(0).optional(),
  is_active: z.boolean().optional(),
  start_at: z.string().datetime().optional().nullable(),
  end_at: z.string().datetime().optional().nullable(),
});

const auditQuerySchema = z.object({
  actor_user_id: z.coerce.number().int().positive().optional(),
  action_key: z.string().trim().optional(),
  entity_type_key: z.string().trim().optional(),
  entity_id: z.coerce.number().int().positive().optional(),
  from_at: z.string().datetime().optional(),
  to_at: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(300).optional(),
});

export const listAdminUsersHandler = async (req, res) => {
  const queryParams = userQuerySchema.parse(req.query || {});
  const users = await listAdminUsers({
    role: queryParams.role,
    status: queryParams.status,
    search: queryParams.search,
    limit: queryParams.limit,
  });
  return ok(res, users);
};

export const createAdminUserHandler = async (req, res) => {
  const payload = createUserSchema.parse(req.body || {});
  const user = await createAdminUser({
    username: payload.username,
    fullName: payload.full_name,
    password: payload.password,
    roleKey: payload.role_key,
    actorUserId: req.user.user_id,
  });
  return created(res, user, "User created");
};

export const updateAdminUserHandler = async (req, res) => {
  const { userId } = userParamSchema.parse(req.params);
  const payload = updateUserSchema.parse(req.body || {});
  const user = await updateAdminUser({
    userId,
    fullName: payload.full_name,
    roleKey: payload.role_key,
    statusKey: payload.status_key,
    resetPassword: payload.reset_password,
    actorUserId: req.user.user_id,
  });
  return ok(res, user, "User updated");
};

export const listAdminMenuItemsHandler = async (_req, res) => {
  const items = await listAdminMenuItems();
  return ok(res, items);
};

export const createAdminMenuItemHandler = async (req, res) => {
  const payload = createMenuSchema.parse(req.body || {});
  const item = await createAdminMenuItem({
    itemName: payload.item_name,
    shortDesc: payload.short_desc,
    categoryKey: payload.category_key,
    itemTypeKey: payload.item_type_key,
    stationKey: payload.station_key,
    availabilityKey: payload.availability_key || "available",
    basePrice: payload.base_price,
    options: payload.options_json || [],
    recipe: payload.recipe_json || [],
    actorUserId: req.user.user_id,
  });
  return created(res, item, "Menu item created");
};

export const updateAdminMenuItemHandler = async (req, res) => {
  const { menuItemId } = menuParamSchema.parse(req.params);
  const payload = updateMenuSchema.parse(req.body || {});
  const item = await updateAdminMenuItem({
    menuItemId,
    itemName: payload.item_name,
    shortDesc: payload.short_desc,
    categoryKey: payload.category_key,
    itemTypeKey: payload.item_type_key,
    stationKey: payload.station_key,
    availabilityKey: payload.availability_key,
    basePrice: payload.base_price,
    options: payload.options_json,
    recipe: payload.recipe_json,
    actorUserId: req.user.user_id,
  });
  return ok(res, item, "Menu item updated");
};

export const listPromotionsHandler = async (_req, res) => {
  const data = await listPromotions();
  return ok(res, data);
};

export const createPromotionHandler = async (req, res) => {
  const payload = createPromotionSchema.parse(req.body || {});
  const promotion = await createPromotion({
    promotionCode: payload.promotion_code,
    promotionName: payload.promotion_name,
    discountTypeKey: payload.discount_type_key,
    discountValue: payload.discount_value,
    maxDiscountAmount: payload.max_discount_amount,
    minOrderAmount: payload.min_order_amount,
    isActive: payload.is_active,
    startAt: payload.start_at,
    endAt: payload.end_at,
    actorUserId: req.user.user_id,
  });
  return created(res, promotion, "Promotion created");
};

export const updatePromotionHandler = async (req, res) => {
  const { promotionId } = promotionParamSchema.parse(req.params);
  const payload = updatePromotionSchema.parse(req.body || {});
  const promotion = await updatePromotion({
    promotionId,
    promotionName: payload.promotion_name,
    discountTypeKey: payload.discount_type_key,
    discountValue: payload.discount_value,
    maxDiscountAmount: payload.max_discount_amount,
    minOrderAmount: payload.min_order_amount,
    isActive: payload.is_active,
    startAt: payload.start_at,
    endAt: payload.end_at,
    actorUserId: req.user.user_id,
  });
  return ok(res, promotion, "Promotion updated");
};

export const listAuditLogsHandler = async (req, res) => {
  const queryParams = auditQuerySchema.parse(req.query || {});
  const logs = await listAuditLogs({
    actorUserId: queryParams.actor_user_id,
    actionKey: queryParams.action_key,
    entityTypeKey: queryParams.entity_type_key,
    entityId: queryParams.entity_id,
    fromAt: queryParams.from_at,
    toAt: queryParams.to_at,
    limit: queryParams.limit,
  });
  return ok(res, logs);
};
