CREATE TABLE IF NOT EXISTS users (
  user_id BIGSERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_key VARCHAR(30) NOT NULL CHECK (
    role_key IN ('manager', 'waiter', 'chef', 'cashier', 'host', 'admin')
  ),
  status_key VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (
    status_key IN ('active', 'locked')
  ),
  last_login_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dining_tables (
  table_id BIGSERIAL PRIMARY KEY,
  table_code VARCHAR(30) NOT NULL UNIQUE,
  area_key VARCHAR(30) NOT NULL,
  capacity INT NOT NULL,
  current_status_key VARCHAR(30) NOT NULL DEFAULT 'available' CHECK (
    current_status_key IN ('available', 'reserved', 'occupied', 'cleaning', 'out_of_service')
  ),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS menu_items (
  menu_item_id BIGSERIAL PRIMARY KEY,
  item_name VARCHAR(150) NOT NULL,
  short_desc VARCHAR(255) NOT NULL DEFAULT '',
  category_key VARCHAR(50) NOT NULL,
  item_type_key VARCHAR(30) NOT NULL,
  station_key VARCHAR(30) NOT NULL,
  availability_key VARCHAR(30) NOT NULL DEFAULT 'available' CHECK (
    availability_key IN ('available', 'unavailable')
  ),
  base_price NUMERIC(14, 0) NOT NULL CHECK (base_price >= 0),
  options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipe_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS table_sessions (
  session_id BIGSERIAL PRIMARY KEY,
  current_table_id BIGINT NOT NULL REFERENCES dining_tables(table_id),
  source_key VARCHAR(30) NOT NULL DEFAULT 'walk_in',
  booking_status_key VARCHAR(30) NOT NULL DEFAULT 'seated',
  session_status_key VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (
    session_status_key IN ('open', 'awaiting_payment', 'closed', 'service_completed')
  ),
  customer_name VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(30) NOT NULL DEFAULT '',
  party_size INT NOT NULL CHECK (party_size > 0),
  requested_time TIMESTAMPTZ NOT NULL,
  seated_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NULL,
  opened_by BIGINT NOT NULL REFERENCES users(user_id),
  notes VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  order_id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES table_sessions(session_id),
  order_no VARCHAR(40) UNIQUE NULL,
  order_type_key VARCHAR(30) NOT NULL DEFAULT 'dine_in',
  order_status_key VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by BIGINT NOT NULL REFERENCES users(user_id),
  confirmed_by BIGINT NULL REFERENCES users(user_id),
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS order_items (
  order_item_id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  parent_order_item_id BIGINT NULL REFERENCES order_items(order_item_id),
  menu_item_id BIGINT NOT NULL REFERENCES menu_items(menu_item_id),
  item_name_snapshot VARCHAR(150) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price_snapshot NUMERIC(14, 0) NOT NULL CHECK (unit_price_snapshot >= 0),
  line_subtotal NUMERIC(14, 0) NOT NULL CHECK (line_subtotal >= 0),
  selected_options_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT NOT NULL DEFAULT '',
  kitchen_status_key VARCHAR(30) NOT NULL DEFAULT 'pending_confirm',
  completed_at TIMESTAMPTZ NULL,
  served_at TIMESTAMPTZ NULL,
  added_by BIGINT NOT NULL REFERENCES users(user_id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS bills (
  bill_id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES table_sessions(session_id),
  parent_bill_id BIGINT NULL REFERENCES bills(bill_id),
  bill_status_key VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (
    bill_status_key IN ('open', 'paid', 'void', 'refunded')
  ),
  subtotal_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  discount_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  service_charge_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (service_charge_amount >= 0),
  tax_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  tip_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (tip_amount >= 0),
  total_amount NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  split_count INT NOT NULL DEFAULT 1 CHECK (split_count >= 1 AND split_count <= 20),
  payment_method_key VARCHAR(30) NULL CHECK (
    payment_method_key IS NULL OR payment_method_key IN ('cash', 'card', 'digital_wallet')
  ),
  payment_status_key VARCHAR(30) NOT NULL DEFAULT 'unpaid' CHECK (
    payment_status_key IN ('unpaid', 'partial', 'paid', 'void', 'refunded')
  ),
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

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_log_id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT NOT NULL REFERENCES users(user_id),
  action_key VARCHAR(100) NOT NULL,
  entity_type_key VARCHAR(50) NOT NULL,
  entity_id BIGINT NOT NULL,
  result_key VARCHAR(20) NOT NULL DEFAULT 'success',
  reason VARCHAR(255) NOT NULL DEFAULT '',
  before_json JSONB NULL,
  after_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_sessions_open
  ON table_sessions(current_table_id, session_status_key);

CREATE INDEX IF NOT EXISTS idx_orders_session_status
  ON orders(session_id, order_status_key);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_kitchen_status
  ON order_items(kitchen_status_key, added_at);

CREATE INDEX IF NOT EXISTS idx_promotions_active
  ON promotions(is_active, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_bills_session_status
  ON bills(session_id, bill_status_key, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_change_requests_order_item_status
  ON order_item_change_requests(order_item_id, status_key, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_change_requests_status
  ON order_item_change_requests(status_key, requested_at DESC);
