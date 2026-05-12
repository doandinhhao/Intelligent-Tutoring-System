import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  dbHost: process.env.IRMS_DB_HOST || "127.0.0.1",
  dbPort: Number(process.env.IRMS_DB_PORT || 55432),
  dbName: process.env.IRMS_DB_NAME || "irms",
  dbUser: process.env.IRMS_DB_USER || "irms_user",
  dbPassword: process.env.IRMS_DB_PASSWORD || "irms_pass",
};
