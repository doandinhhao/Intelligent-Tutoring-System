import { AppError } from "../helpers/errors.js";
import { verifyToken } from "../libs/jwt.js";
import { getActiveUserById } from "../services/authService.js";

export const requireAuth = async (req, _res, next) => {
  const authorization = req.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new AppError("Missing or invalid Authorization header", 401));
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(new AppError("Invalid or expired token", 401));
  }

  const user = await getActiveUserById(payload.userId);
  if (!user) {
    return next(new AppError("Unauthorized", 401));
  }

  req.user = {
    user_id: Number(user.user_id),
    username: user.username,
    full_name: user.full_name,
    role_key: user.role_key,
  };

  return next();
};

export const requireRoles = (...roles) => {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError("Unauthorized", 401));
    }
    if (!roles.includes(req.user.role_key)) {
      return next(new AppError("Forbidden", 403));
    }
    return next();
  };
};
