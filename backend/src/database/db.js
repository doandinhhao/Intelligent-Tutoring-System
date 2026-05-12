import pg from "pg";
import { env } from "../configs/env.js";

const { Pool } = pg;

let pool = null;

const ensureSchema = async () => {
  await pool.query(`
    ALTER TABLE IF EXISTS menu_items
    ADD COLUMN IF NOT EXISTS short_desc VARCHAR(255) NOT NULL DEFAULT '';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS promotions (
      promotion_id BIGSERIAL PRIMARY KEY,
      promotion_code VARCHAR(50) NOT NULL UNIQUE,
      promotion_name VARCHAR(150) NOT NULL,
      discount_type_key VARCHAR(20) NOT NULL CHECK (discount_type_key IN ('percent', 'fixed')),
      discount_value NUMERIC(14, 0) NOT NULL CHECK (discount_value >= 0),
      max_discount_amount NUMERIC(14, 0) NULL CHECK (max_discount_amount IS NULL OR max_discount_amount >= 0),
      min_order_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      start_at TIMESTAMPTZ NULL,
      end_at TIMESTAMPTZ NULL,
      created_by BIGINT NULL REFERENCES users(user_id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bills (
      bill_id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES table_sessions(session_id),
      parent_bill_id BIGINT NULL REFERENCES bills(bill_id),
      bill_status_key VARCHAR(30) NOT NULL DEFAULT 'open',
      subtotal_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
      discount_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
      service_charge_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (service_charge_amount >= 0),
      tax_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
      tip_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (tip_amount >= 0),
      total_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
      split_count INT NOT NULL DEFAULT 1 CHECK (split_count >= 1 AND split_count <= 20),
      payment_method_key VARCHAR(30) NULL,
      payment_status_key VARCHAR(30) NOT NULL DEFAULT 'unpaid',
      paid_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
      paid_at TIMESTAMPTZ NULL,
      external_txn_id VARCHAR(100) NULL,
      refund_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
      refund_reason VARCHAR(255) NOT NULL DEFAULT '',
      adjustment_reason VARCHAR(255) NOT NULL DEFAULT '',
      applied_discount_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      receipt_url VARCHAR(255) NOT NULL DEFAULT '',
      opened_by BIGINT NOT NULL REFERENCES users(user_id),
      closed_by BIGINT NULL REFERENCES users(user_id),
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_item_change_requests (
      change_request_id BIGSERIAL PRIMARY KEY,
      order_item_id BIGINT NOT NULL REFERENCES order_items(order_item_id) ON DELETE CASCADE,
      order_id BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
      request_type_key VARCHAR(30) NOT NULL,
      requested_by BIGINT NOT NULL REFERENCES users(user_id),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      requested_quantity INT NULL CHECK (requested_quantity IS NULL OR requested_quantity > 0),
      requested_note TEXT NULL,
      reason TEXT NOT NULL DEFAULT '',
      status_key VARCHAR(20) NOT NULL DEFAULT 'pending',
      reviewed_by BIGINT NULL REFERENCES users(user_id),
      reviewed_at TIMESTAMPTZ NULL,
      kitchen_note TEXT NOT NULL DEFAULT ''
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_promotions_active
      ON promotions(is_active, start_at, end_at);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bills_session_status
      ON bills(session_id, bill_status_key, opened_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_change_requests_order_item_status
      ON order_item_change_requests(order_item_id, status_key, requested_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_change_requests_status
      ON order_item_change_requests(status_key, requested_at DESC);
  `);
};

export const getDb = () => {
  if (!pool) {
    throw new Error("Database has not been initialized");
  }
  return pool;
};

export const initDb = async () => {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    host: env.dbHost,
    port: env.dbPort,
    database: env.dbName,
    user: env.dbUser,
    password: env.dbPassword,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  await pool.query("SELECT 1");
  await ensureSchema();
  return pool;
};

export const query = async (text, params = []) => {
  const db = getDb();
  return db.query(text, params);
};

export const withTransaction = async (callback) => {
  const db = getDb();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
