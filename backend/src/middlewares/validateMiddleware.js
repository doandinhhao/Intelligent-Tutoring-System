import { AppError } from "../helpers/errors.js";

export const validateBody = (schema) => {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new AppError("Validation failed", 422, parsed.error.issues.map((item) => item.message)),
      );
    }
    req.body = parsed.data;
    return next();
  };
};

