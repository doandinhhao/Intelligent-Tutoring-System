import jwt from "jsonwebtoken";
import { env } from "../configs/env.js";

export const signToken = (payload) => {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
};

export const verifyToken = (token) => {
  return jwt.verify(token, env.jwtSecret);
};

