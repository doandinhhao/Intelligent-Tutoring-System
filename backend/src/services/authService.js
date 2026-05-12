import bcrypt from "bcryptjs";
import { query } from "../database/db.js";
import { AppError } from "../helpers/errors.js";
import { signToken } from "../libs/jwt.js";

const sanitizeUser = (user) => ({
  user_id: Number(user.user_id),
  username: user.username,
  full_name: user.full_name,
  role_key: user.role_key,
  status_key: user.status_key,
});

export const login = async ({ username, password }) => {
  const result = await query(
    `
    SELECT user_id, username, full_name, password_hash, role_key, status_key
    FROM users
    WHERE username = $1
    LIMIT 1
    `,
    [username],
  );
  const user = result.rows[0];

  if (!user || user.status_key !== "active") {
    throw new AppError("Invalid username or password", 401);
  }

  const isMatched = await bcrypt.compare(password, user.password_hash);
  if (!isMatched) {
    throw new AppError("Invalid username or password", 401);
  }

  await query("UPDATE users SET last_login_at = NOW() WHERE user_id = $1", [user.user_id]);

  const payload = {
    userId: Number(user.user_id),
    username: user.username,
    role: user.role_key,
  };

  return {
    token: signToken(payload),
    user: sanitizeUser(user),
  };
};

export const getUserById = async (userId) => {
  const result = await query(
    `
    SELECT user_id, username, full_name, role_key, status_key
    FROM users
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId],
  );
  const user = result.rows[0];

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return sanitizeUser(user);
};

export const getActiveUserById = async (userId) => {
  const result = await query(
    `
    SELECT user_id, username, full_name, role_key, status_key
    FROM users
    WHERE user_id = $1 AND status_key = 'active'
    LIMIT 1
    `,
    [userId],
  );
  return result.rows[0] || null;
};
