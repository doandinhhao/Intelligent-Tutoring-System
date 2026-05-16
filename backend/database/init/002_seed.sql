INSERT INTO users (user_id, username, full_name, password_hash, role_key, status_key, created_at)
VALUES
  (1, 'waiter01', 'Waiter One', '$2b$10$iiRLbIecG6QbNS4xTFVvI.awPUmyd3wASMnCJJB3f2fgP0O8yW6m2', 'waiter', 'active', NOW()),
  (2, 'chef01', 'Chef One', '$2b$10$iiRLbIecG6QbNS4xTFVvI.awPUmyd3wASMnCJJB3f2fgP0O8yW6m2', 'chef', 'active', NOW()),
  (3, 'manager01', 'Manager One', '$2b$10$iiRLbIecG6QbNS4xTFVvI.awPUmyd3wASMnCJJB3f2fgP0O8yW6m2', 'manager', 'active', NOW()),
  (4, 'cashier01', 'Cashier One', '$2b$10$iiRLbIecG6QbNS4xTFVvI.awPUmyd3wASMnCJJB3f2fgP0O8yW6m2', 'cashier', 'active', NOW()),
  (5, 'host01', 'Host One', '$2b$10$iiRLbIecG6QbNS4xTFVvI.awPUmyd3wASMnCJJB3f2fgP0O8yW6m2', 'host', 'active', NOW()),
  (6, 'admin01', 'System Admin', '$2b$10$iiRLbIecG6QbNS4xTFVvI.awPUmyd3wASMnCJJB3f2fgP0O8yW6m2', 'admin', 'active', NOW())
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO dining_tables (table_id, table_code, area_key, capacity, current_status_key, is_active)
VALUES
  (1, 'A1', 'main', 2, 'available', TRUE),
  (2, 'A2', 'main', 2, 'available', TRUE),
  (3, 'A3', 'main', 4, 'available', TRUE),
  (4, 'A4', 'main', 4, 'available', TRUE),
  (5, 'B1', 'patio', 2, 'available', TRUE),
  (6, 'B2', 'patio', 4, 'available', TRUE),
  (7, 'VIP1', 'vip', 6, 'available', TRUE),
  (8, 'VIP2', 'vip', 8, 'available', TRUE)
ON CONFLICT (table_id) DO NOTHING;

INSERT INTO menu_items (
  menu_item_id,
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
VALUES
  (1, 'Grilled Chicken', 'Char-grilled chicken with house seasoning', 'main_course', 'food', 'grill', 'available', 120000, '[]'::jsonb, '[]'::jsonb),
  (2, 'Beef Burger', 'Toasted brioche, beef patty, cheddar and sauce', 'main_course', 'food', 'grill', 'available', 110000, '[{"key":"doneness","values":["medium","well-done"]}]'::jsonb, '[]'::jsonb),
  (3, 'French Fries', 'Crispy fries with sea salt', 'side', 'food', 'fryer', 'available', 45000, '[]'::jsonb, '[]'::jsonb),
  (4, 'Caesar Salad', 'Romaine lettuce, parmesan, Caesar dressing', 'starter', 'food', 'cold_kitchen', 'available', 65000, '[]'::jsonb, '[]'::jsonb),
  (5, 'Lemon Tea', 'Fresh brewed tea with lemon aroma', 'beverage', 'drink', 'beverage', 'available', 30000, '[{"key":"ice","values":["normal","less","no"]}]'::jsonb, '[]'::jsonb),
  (6, 'Chocolate Cake', 'Soft chocolate sponge with ganache', 'dessert', 'food', 'dessert', 'available', 55000, '[]'::jsonb, '[]'::jsonb)
ON CONFLICT (menu_item_id) DO NOTHING;

INSERT INTO promotions (
  promotion_id,
  promotion_code,
  promotion_name,
  discount_type_key,
  discount_value,
  max_discount_amount,
  min_order_amount,
  is_active,
  start_at,
  end_at,
  created_by
)
VALUES
  (1, 'HAPPY10', 'Happy Hour 10% Off', 'percent', 10, 80000, 100000, TRUE, NOW() - INTERVAL '1 day', NOW() + INTERVAL '365 days', 3),
  (2, 'WELCOME50', 'Welcome Voucher 50k', 'fixed', 50000, NULL, 250000, TRUE, NOW() - INTERVAL '1 day', NOW() + INTERVAL '365 days', 3)
ON CONFLICT (promotion_id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('users', 'user_id'), COALESCE((SELECT MAX(user_id) FROM users), 1), TRUE);
SELECT setval(pg_get_serial_sequence('dining_tables', 'table_id'), COALESCE((SELECT MAX(table_id) FROM dining_tables), 1), TRUE);
SELECT setval(pg_get_serial_sequence('menu_items', 'menu_item_id'), COALESCE((SELECT MAX(menu_item_id) FROM menu_items), 1), TRUE);
SELECT setval(pg_get_serial_sequence('promotions', 'promotion_id'), COALESCE((SELECT MAX(promotion_id) FROM promotions), 1), TRUE);
