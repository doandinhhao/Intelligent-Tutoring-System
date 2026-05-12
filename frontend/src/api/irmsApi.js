import { http, unwrap } from "./http";

export const authApi = {
  login: async (payload) => unwrap(await http.post("/auth/login", payload)),
  me: async () => unwrap(await http.get("/auth/me")),
};

export const menuApi = {
  list: async () => unwrap(await http.get("/menu")),
};

export const tablesApi = {
  list: async () => unwrap(await http.get("/tables")),
  openSession: async (payload) => unwrap(await http.post("/tables/sessions", payload)),
  invitePayment: async (sessionId) =>
    unwrap(await http.patch(`/tables/sessions/${sessionId}/invite-payment`)),
};

export const ordersApi = {
  getActiveBySession: async (sessionId) =>
    unwrap(await http.get(`/orders/sessions/${sessionId}/active`)),
  listBySession: async (sessionId, status) =>
    unwrap(await http.get(`/orders/sessions/${sessionId}/orders`, { params: status ? { status } : {} })),
  createDraftBySession: async (sessionId, payload = {}) =>
    unwrap(await http.post(`/orders/sessions/${sessionId}/draft`, payload)),
  addItem: async (orderId, payload) => unwrap(await http.post(`/orders/${orderId}/items`, payload)),
  removeItem: async (orderId, itemId) =>
    unwrap(await http.delete(`/orders/${orderId}/items/${itemId}`)),
  confirm: async (orderId) => unwrap(await http.post(`/orders/${orderId}/confirm`)),
  getDetail: async (orderId) => unwrap(await http.get(`/orders/${orderId}`)),
  listChangeRequests: async (orderId, status) =>
    unwrap(await http.get(`/orders/${orderId}/change-requests`, { params: status ? { status } : {} })),
  createChangeRequest: async (orderId, itemId, payload) =>
    unwrap(await http.post(`/orders/${orderId}/items/${itemId}/change-requests`, payload)),
};

export const kitchenApi = {
  listItems: async (status) =>
    unwrap(await http.get("/kitchen/items", { params: status ? { status } : {} })),
  updateItemStatus: async (itemId, status) =>
    unwrap(await http.patch(`/kitchen/items/${itemId}/status`, { status })),
  markServed: async (itemId) => unwrap(await http.patch(`/kitchen/items/${itemId}/served`)),
  listChangeRequests: async (status) =>
    unwrap(await http.get("/kitchen/change-requests", { params: status ? { status } : {} })),
  reviewChangeRequest: async (requestId, payload) =>
    unwrap(await http.patch(`/kitchen/change-requests/${requestId}/review`, payload)),
};

export const billingApi = {
  getLatestBySession: async (sessionId) =>
    unwrap(await http.get(`/billing/sessions/${sessionId}/latest`)),
  openBySession: async (sessionId, payload = {}) =>
    unwrap(await http.post(`/billing/sessions/${sessionId}/open`, payload)),
  getDetail: async (billId) => unwrap(await http.get(`/billing/${billId}`)),
  adjust: async (billId, payload) => unwrap(await http.patch(`/billing/${billId}/adjust`, payload)),
  pay: async (billId, payload) => unwrap(await http.patch(`/billing/${billId}/pay`, payload)),
  void: async (billId, payload) => unwrap(await http.patch(`/billing/${billId}/void`, payload)),
  refund: async (billId, payload) => unwrap(await http.patch(`/billing/${billId}/refund`, payload)),
  receipt: async (billId) => unwrap(await http.get(`/billing/${billId}/receipt`)),
};

export const adminApi = {
  listUsers: async (params = {}) => unwrap(await http.get("/admin/users", { params })),
  createUser: async (payload) => unwrap(await http.post("/admin/users", payload)),
  updateUser: async (userId, payload) => unwrap(await http.patch(`/admin/users/${userId}`, payload)),
  listMenu: async () => unwrap(await http.get("/admin/menu")),
  createMenu: async (payload) => unwrap(await http.post("/admin/menu", payload)),
  updateMenu: async (menuItemId, payload) =>
    unwrap(await http.patch(`/admin/menu/${menuItemId}`, payload)),
  listPromotions: async () => unwrap(await http.get("/admin/promotions")),
  createPromotion: async (payload) => unwrap(await http.post("/admin/promotions", payload)),
  updatePromotion: async (promotionId, payload) =>
    unwrap(await http.patch(`/admin/promotions/${promotionId}`, payload)),
  listAuditLogs: async (params = {}) => unwrap(await http.get("/admin/audit-logs", { params })),
};
