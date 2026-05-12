import { ok } from "../helpers/http.js";
import { listMenuItems } from "../services/menuService.js";

export const getMenuHandler = async (_req, res) => {
  const data = await listMenuItems();
  return ok(res, data);
};
