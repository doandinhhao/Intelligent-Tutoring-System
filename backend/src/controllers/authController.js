import { z } from "zod";
import { created, ok } from "../helpers/http.js";
import { login, getUserById } from "../services/authService.js";

const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(4),
});

export const loginHandler = async (req, res) => {
  const payload = loginSchema.parse(req.body);
  const data = await login(payload);
  return created(res, data, "Login successful");
};

export const meHandler = async (req, res) => {
  const user = await getUserById(req.user.user_id);
  return ok(res, user);
};
