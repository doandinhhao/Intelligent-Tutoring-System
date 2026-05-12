import { AppError } from "../helpers/errors.js";
import { fail } from "../helpers/http.js";

export const notFoundHandler = (_req, _res, next) => {
  return next(new AppError("Route not found", 404));
};

export const errorHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    return fail(res, error.status, error.message, error.details);
  }

  if (error?.name === "ZodError") {
    return fail(
      res,
      422,
      "Validation failed",
      error.issues?.map((item) => item.message) || null,
    );
  }

  // Log unexpected errors for server-side debugging.
  // eslint-disable-next-line no-console
  console.error(error);
  return fail(res, 500, "Internal server error");
};
