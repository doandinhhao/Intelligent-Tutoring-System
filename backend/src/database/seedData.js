import bcrypt from "bcryptjs";

const diningTables = [
  { table_id: 1, table_code: "A1", area_key: "main", capacity: 2 },
  { table_id: 2, table_code: "A2", area_key: "main", capacity: 2 },
  { table_id: 3, table_code: "A3", area_key: "main", capacity: 4 },
  { table_id: 4, table_code: "A4", area_key: "main", capacity: 4 },
  { table_id: 5, table_code: "B1", area_key: "patio", capacity: 2 },
  { table_id: 6, table_code: "B2", area_key: "patio", capacity: 4 },
  { table_id: 7, table_code: "VIP1", area_key: "vip", capacity: 6 },
  { table_id: 8, table_code: "VIP2", area_key: "vip", capacity: 8 },
];

const menuItems = [
  {
    menu_item_id: 1,
    item_name: "Grilled Chicken",
    short_desc: "Char-grilled chicken with house seasoning",
    category_key: "main_course",
    item_type_key: "food",
    station_key: "grill",
    availability_key: "available",
    base_price: 120000,
    options_json: [],
    recipe_json: [],
  },
  {
    menu_item_id: 2,
    item_name: "Beef Burger",
    short_desc: "Toasted brioche, beef patty, cheddar and sauce",
    category_key: "main_course",
    item_type_key: "food",
    station_key: "grill",
    availability_key: "available",
    base_price: 110000,
    options_json: [{ key: "doneness", values: ["medium", "well-done"] }],
    recipe_json: [],
  },
  {
    menu_item_id: 3,
    item_name: "French Fries",
    short_desc: "Crispy fries with sea salt",
    category_key: "side",
    item_type_key: "food",
    station_key: "fryer",
    availability_key: "available",
    base_price: 45000,
    options_json: [],
    recipe_json: [],
  },
  {
    menu_item_id: 4,
    item_name: "Caesar Salad",
    short_desc: "Romaine lettuce, parmesan, Caesar dressing",
    category_key: "starter",
    item_type_key: "food",
    station_key: "cold_kitchen",
    availability_key: "available",
    base_price: 65000,
    options_json: [],
    recipe_json: [],
  },
  {
    menu_item_id: 5,
    item_name: "Lemon Tea",
    short_desc: "Fresh brewed tea with lemon aroma",
    category_key: "beverage",
    item_type_key: "drink",
    station_key: "beverage",
    availability_key: "available",
    base_price: 30000,
    options_json: [{ key: "ice", values: ["normal", "less", "no"] }],
    recipe_json: [],
  },
  {
    menu_item_id: 6,
    item_name: "Chocolate Cake",
    short_desc: "Soft chocolate sponge with ganache",
    category_key: "dessert",
    item_type_key: "food",
    station_key: "dessert",
    availability_key: "available",
    base_price: 55000,
    options_json: [],
    recipe_json: [],
  },
];

const users = [
  { user_id: 1, username: "waiter01", full_name: "Waiter One", role_key: "waiter" },
  { user_id: 2, username: "chef01", full_name: "Chef One", role_key: "chef" },
  { user_id: 3, username: "manager01", full_name: "Manager One", role_key: "manager" },
  { user_id: 4, username: "cashier01", full_name: "Cashier One", role_key: "cashier" },
  { user_id: 5, username: "host01", full_name: "Host One", role_key: "host" },
  { user_id: 6, username: "admin01", full_name: "System Admin", role_key: "admin" },
];

const promotions = [
  {
    promotion_id: 1,
    promotion_code: "HAPPY10",
    promotion_name: "Happy Hour 10% Off",
    discount_type_key: "percent",
    discount_value: 10,
    max_discount_amount: 80000,
    min_order_amount: 100000,
    is_active: true,
  },
  {
    promotion_id: 2,
    promotion_code: "WELCOME50",
    promotion_name: "Welcome Voucher 50k",
    discount_type_key: "fixed",
    discount_value: 50000,
    max_discount_amount: null,
    min_order_amount: 250000,
    is_active: true,
  },
];

export const seedCoreData = async (client) => {
  const passwordHash = await bcrypt.hash("123456", 10);

  await client.query(
    "TRUNCATE TABLE audit_logs, order_item_change_requests, bills, promotions, order_items, orders, table_sessions, menu_items, dining_tables, users RESTART IDENTITY CASCADE",
  );

  for (const user of users) {
    await client.query(
      `
      INSERT INTO users (user_id, username, full_name, password_hash, role_key, status_key, created_at)
      VALUES ($1, $2, $3, $4, $5, 'active', NOW())
      `,
      [user.user_id, user.username, user.full_name, passwordHash, user.role_key],
    );
  }

  for (const table of diningTables) {
    await client.query(
      `
      INSERT INTO dining_tables (table_id, table_code, area_key, capacity, current_status_key, is_active)
      VALUES ($1, $2, $3, $4, 'available', TRUE)
      `,
      [table.table_id, table.table_code, table.area_key, table.capacity],
    );
  }

  for (const item of menuItems) {
    await client.query(
      `
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
      `,
      [
        item.menu_item_id,
        item.item_name,
        item.short_desc,
        item.category_key,
        item.item_type_key,
        item.station_key,
        item.availability_key,
        item.base_price,
        JSON.stringify(item.options_json),
        JSON.stringify(item.recipe_json),
      ],
    );
  }

  for (const promo of promotions) {
    await client.query(
      `
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
        created_by,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        NOW() - INTERVAL '1 day',
        NOW() + INTERVAL '365 days',
        3,
        NOW()
      )
      `,
      [
        promo.promotion_id,
        promo.promotion_code,
        promo.promotion_name,
        promo.discount_type_key,
        promo.discount_value,
        promo.max_discount_amount,
        promo.min_order_amount,
        promo.is_active,
      ],
    );
  }

  await client.query(
    "SELECT setval(pg_get_serial_sequence('users', 'user_id'), COALESCE((SELECT MAX(user_id) FROM users), 1), TRUE)",
  );
  await client.query(
    "SELECT setval(pg_get_serial_sequence('dining_tables', 'table_id'), COALESCE((SELECT MAX(table_id) FROM dining_tables), 1), TRUE)",
  );
  await client.query(
    "SELECT setval(pg_get_serial_sequence('menu_items', 'menu_item_id'), COALESCE((SELECT MAX(menu_item_id) FROM menu_items), 1), TRUE)",
  );
  await client.query(
    "SELECT setval(pg_get_serial_sequence('promotions', 'promotion_id'), COALESCE((SELECT MAX(promotion_id) FROM promotions), 1), TRUE)",
  );
};
