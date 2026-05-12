import { query } from "../database/db.js";

export const listMenuItems = async ({ includeUnavailable = false } = {}) => {
  const params = [];
  let whereClause = "";

  if (!includeUnavailable) {
    params.push("available");
    whereClause = "WHERE availability_key = $1";
  }

  const result = await query(
    `
    SELECT
      menu_item_id::int AS menu_item_id,
      item_name,
      short_desc,
      category_key,
      item_type_key,
      station_key,
      availability_key,
      base_price::int AS base_price,
      options_json,
      recipe_json
    FROM menu_items
    ${whereClause}
    ORDER BY category_key ASC, item_name ASC
    `,
    params,
  );

  return result.rows;
};
