import bcrypt from "bcryptjs";
import { query, withTransaction } from "../database/db.js";
import { AppError } from "../helpers/errors.js";
import { writeAuditLog } from "./auditService.js";
import { listMenuItems } from "./menuService.js";

const ALLOWED_ROLES = ["manager", "waiter", "chef", "cashier", "host", "admin"];
const ALLOWED_STATUSES = ["active", "locked"];

const mapUser = (row) => ({
  user_id: Number(row.user_id),
  username: row.username,
  full_name: row.full_name,
  role_key: row.role_key,
  status_key: row.status_key,
  last_login_at: row.last_login_at,
  created_at: row.created_at,
});

const mapPromotion = (row) => ({
  promotion_id: Number(row.promotion_id),
  promotion_code: row.promotion_code,
  promotion_name: row.promotion_name,
  discount_type_key: row.discount_type_key,
  discount_value: Number(row.discount_value || 0),
  max_discount_amount:
    row.max_discount_amount === null ? null : Number(row.max_discount_amount || 0),
  min_order_amount: Number(row.min_order_amount || 0),
  is_active: Boolean(row.is_active),
  start_at: row.start_at,
  end_at: row.end_at,
  created_by: row.created_by === null ? null : Number(row.created_by),
  created_at: row.created_at,
});

const ensureRole = (role) => {
  if (!ALLOWED_ROLES.includes(role)) {
    throw new AppError("Unsupported role", 400);
  }
};

const ensureStatus = (status) => {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new AppError("Unsupported status", 400);
  }
};

export const listAdminUsers = async ({ role, status, search, limit = 100 }) => {
  const params = [];
  const where = [];

  if (role) {
    params.push(role);
    where.push(`role_key = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`status_key = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.trim()}%`);
    where.push(`(username ILIKE $${params.length} OR full_name ILIKE $${params.length})`);
  }

  params.push(Math.min(200, Math.max(1, Number(limit) || 100)));
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const result = await query(
    `
    SELECT
      user_id::int AS user_id,
      username,
      full_name,
      role_key,
      status_key,
      last_login_at,
      created_at
    FROM users
    ${whereClause}
    ORDER BY created_at DESC, user_id DESC
    LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map(mapUser);
};

export const createAdminUser = async ({
  username,
  fullName,
  password,
  roleKey,
  actorUserId,
}) => {
  ensureRole(roleKey);
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedFullName = fullName.trim();
  const passwordHash = await bcrypt.hash(password, 10);

  let result;
  try {
    result = await query(
      `
      INSERT INTO users (
        username,
        full_name,
        password_hash,
        role_key,
        status_key,
        created_at
      )
      VALUES ($1, $2, $3, $4, 'active', NOW())
      RETURNING
        user_id::int AS user_id,
        username,
        full_name,
        role_key,
        status_key,
        last_login_at,
        created_at
      `,
      [normalizedUsername, normalizedFullName, passwordHash, roleKey],
    );
  } catch (error) {
    if (error?.code === "23505") {
      throw new AppError("Username already exists", 409);
    }
    throw error;
  }

  const user = mapUser(result.rows[0]);

  await writeAuditLog({
    actorUserId,
    actionKey: "admin.user.create",
    entityTypeKey: "users",
    entityId: user.user_id,
    afterJson: user,
  });

  return user;
};

export const updateAdminUser = async ({
  userId,
  fullName,
  roleKey,
  statusKey,
  resetPassword,
  actorUserId,
}) => {
  if (roleKey) {
    ensureRole(roleKey);
  }
  if (statusKey) {
    ensureStatus(statusKey);
  }

  const beforeResult = await query(
    `
    SELECT
      user_id::int AS user_id,
      username,
      full_name,
      role_key,
      status_key,
      last_login_at,
      created_at
    FROM users
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId],
  );
  const before = beforeResult.rows[0] ? mapUser(beforeResult.rows[0]) : null;
  if (!before) {
    throw new AppError("User not found", 404);
  }

  if (before.user_id === actorUserId && statusKey === "locked") {
    throw new AppError("Cannot lock your own account", 400);
  }

  await withTransaction(async (client) => {
    await client.query(
      `
      UPDATE users
      SET
        full_name = COALESCE($1, full_name),
        role_key = COALESCE($2, role_key),
        status_key = COALESCE($3, status_key)
      WHERE user_id = $4
      `,
      [fullName?.trim() || null, roleKey || null, statusKey || null, userId],
    );

    if (resetPassword) {
      const hash = await bcrypt.hash(resetPassword, 10);
      await client.query("UPDATE users SET password_hash = $1 WHERE user_id = $2", [hash, userId]);
    }
  });

  const afterResult = await query(
    `
    SELECT
      user_id::int AS user_id,
      username,
      full_name,
      role_key,
      status_key,
      last_login_at,
      created_at
    FROM users
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId],
  );
  const after = mapUser(afterResult.rows[0]);

  await writeAuditLog({
    actorUserId,
    actionKey: "admin.user.update",
    entityTypeKey: "users",
    entityId: userId,
    beforeJson: before,
    afterJson: after,
  });

  return after;
};

export const listAdminMenuItems = async () => {
  return listMenuItems({ includeUnavailable: true });
};

export const createAdminMenuItem = async ({
  itemName,
  shortDesc,
  categoryKey,
  itemTypeKey,
  stationKey,
  availabilityKey,
  basePrice,
  options,
  recipe,
  actorUserId,
}) => {
  const result = await query(
    `
    INSERT INTO menu_items (
      item_name,
      short_desc,
      category_key,
      item_type_key,
      station_key,
      availability_key,
      base_price,
      options_json,
      recipe_json
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
    RETURNING menu_item_id::int AS menu_item_id
    `,
    [
      itemName.trim(),
      shortDesc?.trim() || "",
      categoryKey.trim(),
      itemTypeKey.trim(),
      stationKey.trim(),
      availabilityKey,
      Math.round(Number(basePrice)),
      JSON.stringify(options || []),
      JSON.stringify(recipe || []),
    ],
  );

  const menuItemId = Number(result.rows[0].menu_item_id);
  const item = (await listAdminMenuItems()).find((entry) => entry.menu_item_id === menuItemId);

  await writeAuditLog({
    actorUserId,
    actionKey: "admin.menu.create",
    entityTypeKey: "menu_items",
    entityId: menuItemId,
    afterJson: item,
  });

  return item;
};

export const updateAdminMenuItem = async ({
  menuItemId,
  itemName,
  shortDesc,
  categoryKey,
  itemTypeKey,
  stationKey,
  availabilityKey,
  basePrice,
  options,
  recipe,
  actorUserId,
}) => {
  const beforeResult = await query(
    `
    SELECT
      menu_item_id::int AS menu_item_id,
      item_name,
      short_desc,
      category_key,
      item_type_key,
      station_key,
      availability_key,
      base_price::int AS base_price,
      options_json,
      recipe_json
    FROM menu_items
    WHERE menu_item_id = $1
    LIMIT 1
    `,
    [menuItemId],
  );
  const before = beforeResult.rows[0];
  if (!before) {
    throw new AppError("Menu item not found", 404);
  }

  await query(
    `
    UPDATE menu_items
    SET
      item_name = COALESCE($1, item_name),
      short_desc = COALESCE($2, short_desc),
      category_key = COALESCE($3, category_key),
      item_type_key = COALESCE($4, item_type_key),
      station_key = COALESCE($5, station_key),
      availability_key = COALESCE($6, availability_key),
      base_price = COALESCE($7, base_price),
      options_json = COALESCE($8::jsonb, options_json),
      recipe_json = COALESCE($9::jsonb, recipe_json)
    WHERE menu_item_id = $10
    `,
    [
      itemName?.trim() || null,
      shortDesc?.trim() || null,
      categoryKey?.trim() || null,
      itemTypeKey?.trim() || null,
      stationKey?.trim() || null,
      availabilityKey || null,
      basePrice === undefined ? null : Math.round(Number(basePrice)),
      options === undefined ? null : JSON.stringify(options),
      recipe === undefined ? null : JSON.stringify(recipe),
      menuItemId,
    ],
  );

  const afterResult = await query(
    `
    SELECT
      menu_item_id::int AS menu_item_id,
      item_name,
      short_desc,
      category_key,
      item_type_key,
      station_key,
      availability_key,
      base_price::int AS base_price,
      options_json,
      recipe_json
    FROM menu_items
    WHERE menu_item_id = $1
    LIMIT 1
    `,
    [menuItemId],
  );
  const after = afterResult.rows[0];

  await writeAuditLog({
    actorUserId,
    actionKey: "admin.menu.update",
    entityTypeKey: "menu_items",
    entityId: menuItemId,
    beforeJson: before,
    afterJson: after,
  });

  return after;
};

export const listPromotions = async () => {
  const result = await query(
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
      end_at,
      created_by::int AS created_by,
      created_at
    FROM promotions
    ORDER BY created_at DESC, promotion_id DESC
    `,
  );

  return result.rows.map(mapPromotion);
};

export const createPromotion = async ({
  promotionCode,
  promotionName,
  discountTypeKey,
  discountValue,
  maxDiscountAmount,
  minOrderAmount,
  isActive = true,
  startAt,
  endAt,
  actorUserId,
}) => {
  let result;
  try {
    result = await query(
      `
      INSERT INTO promotions (
        promotion_code,
        promotion_name,
        discount_type_key,
        discount_value,
        max_discount_amount,
        min_order_amount,
        is_active,
        start_at,
        end_at,
        created_by,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING
        promotion_id::int AS promotion_id,
        promotion_code,
        promotion_name,
        discount_type_key,
        discount_value::int AS discount_value,
        max_discount_amount::int AS max_discount_amount,
        min_order_amount::int AS min_order_amount,
        is_active,
        start_at,
        end_at,
        created_by::int AS created_by,
        created_at
      `,
      [
        promotionCode.trim().toUpperCase(),
        promotionName.trim(),
        discountTypeKey,
        Math.round(Number(discountValue)),
        maxDiscountAmount === undefined || maxDiscountAmount === null
          ? null
          : Math.round(Number(maxDiscountAmount)),
        Math.round(Number(minOrderAmount || 0)),
        Boolean(isActive),
        startAt || null,
        endAt || null,
        actorUserId,
      ],
    );
  } catch (error) {
    if (error?.code === "23505") {
      throw new AppError("Promotion code already exists", 409);
    }
    throw error;
  }

  const promotion = mapPromotion(result.rows[0]);

  await writeAuditLog({
    actorUserId,
    actionKey: "admin.promotion.create",
    entityTypeKey: "promotions",
    entityId: promotion.promotion_id,
    afterJson: promotion,
  });

  return promotion;
};

export const updatePromotion = async ({
  promotionId,
  promotionName,
  discountTypeKey,
  discountValue,
  maxDiscountAmount,
  minOrderAmount,
  isActive,
  startAt,
  endAt,
  actorUserId,
}) => {
  const beforeResult = await query(
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
      end_at,
      created_by::int AS created_by,
      created_at
    FROM promotions
    WHERE promotion_id = $1
    LIMIT 1
    `,
    [promotionId],
  );
  const before = beforeResult.rows[0] ? mapPromotion(beforeResult.rows[0]) : null;
  if (!before) {
    throw new AppError("Promotion not found", 404);
  }

  await query(
    `
    UPDATE promotions
    SET
      promotion_name = COALESCE($1, promotion_name),
      discount_type_key = COALESCE($2, discount_type_key),
      discount_value = COALESCE($3, discount_value),
      max_discount_amount = COALESCE($4, max_discount_amount),
      min_order_amount = COALESCE($5, min_order_amount),
      is_active = COALESCE($6, is_active),
      start_at = COALESCE($7, start_at),
      end_at = COALESCE($8, end_at)
    WHERE promotion_id = $9
    `,
    [
      promotionName?.trim() || null,
      discountTypeKey || null,
      discountValue === undefined ? null : Math.round(Number(discountValue)),
      maxDiscountAmount === undefined
        ? null
        : maxDiscountAmount === null
          ? before.max_discount_amount
          : Math.round(Number(maxDiscountAmount)),
      minOrderAmount === undefined ? null : Math.round(Number(minOrderAmount)),
      isActive === undefined ? null : Boolean(isActive),
      startAt || null,
      endAt || null,
      promotionId,
    ],
  );

  const afterResult = await query(
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
      end_at,
      created_by::int AS created_by,
      created_at
    FROM promotions
    WHERE promotion_id = $1
    LIMIT 1
    `,
    [promotionId],
  );
  const after = mapPromotion(afterResult.rows[0]);

  await writeAuditLog({
    actorUserId,
    actionKey: "admin.promotion.update",
    entityTypeKey: "promotions",
    entityId: promotionId,
    beforeJson: before,
    afterJson: after,
  });

  return after;
};

export const listAuditLogs = async ({
  actorUserId,
  actionKey,
  entityTypeKey,
  entityId,
  fromAt,
  toAt,
  limit = 120,
}) => {
  const params = [];
  const where = [];

  if (actorUserId) {
    params.push(Number(actorUserId));
    where.push(`al.actor_user_id = $${params.length}`);
  }
  if (actionKey) {
    params.push(actionKey.trim());
    where.push(`al.action_key = $${params.length}`);
  }
  if (entityTypeKey) {
    params.push(entityTypeKey.trim());
    where.push(`al.entity_type_key = $${params.length}`);
  }
  if (entityId) {
    params.push(Number(entityId));
    where.push(`al.entity_id = $${params.length}`);
  }
  if (fromAt) {
    params.push(fromAt);
    where.push(`al.created_at >= $${params.length}`);
  }
  if (toAt) {
    params.push(toAt);
    where.push(`al.created_at <= $${params.length}`);
  }

  params.push(Math.min(300, Math.max(1, Number(limit) || 120)));
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const result = await query(
    `
    SELECT
      al.audit_log_id::int AS audit_log_id,
      al.actor_user_id::int AS actor_user_id,
      u.username AS actor_username,
      u.full_name AS actor_full_name,
      al.action_key,
      al.entity_type_key,
      al.entity_id::int AS entity_id,
      al.result_key,
      al.reason,
      al.before_json,
      al.after_json,
      al.created_at
    FROM audit_logs al
    JOIN users u ON u.user_id = al.actor_user_id
    ${whereClause}
    ORDER BY al.created_at DESC, al.audit_log_id DESC
    LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map((row) => ({
    ...row,
    audit_log_id: Number(row.audit_log_id),
    actor_user_id: Number(row.actor_user_id),
    entity_id: Number(row.entity_id),
  }));
};
