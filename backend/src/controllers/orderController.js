import { z } from "zod";
import { created, ok } from "../helpers/http.js";
import {
  addOrderItem,
  confirmOrder,
  createOrGetDraftOrder,
  getActiveOrderBySession,
  listOrdersBySession,
  getOrderDetail,
  removeOrderItem,
  updateOrderItem,
} from "../services/orderService.js";
import {
  createOrderItemChangeRequest,
  listOrderChangeRequests,
} from "../services/orderChangeRequestService.js";

const sessionParamSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
});

const orderParamSchema = z.object({
  orderId: z.coerce.number().int().positive(),
});

const orderItemParamSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});

const createDraftSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

const addItemSchema = z.object({
  menu_item_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
  selected_options: z.record(z.any()).optional(),
  note: z.string().trim().max(500).optional(),
});

const updateItemSchema = z.object({
  quantity: z.coerce.number().int().positive().optional(),
  note: z.string().trim().max(500).optional(),
});

const changeRequestParamSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});

const changeRequestSchema = z.object({
  request_type: z.enum(["cancel_item", "change_quantity", "change_note"]),
  requested_quantity: z.coerce.number().int().positive().optional(),
  requested_note: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(255).optional(),
});

const changeRequestQuerySchema = z.object({
  status: z.string().optional(),
});

const listOrdersQuerySchema = z.object({
  status: z.string().optional(),
});

export const getActiveOrderBySessionHandler = async (req, res) => {
  const { sessionId } = sessionParamSchema.parse(req.params);
  const order = await getActiveOrderBySession(sessionId);
  return ok(res, order);
};

export const listOrdersBySessionHandler = async (req, res) => {
  const { sessionId } = sessionParamSchema.parse(req.params);
  const query = listOrdersQuerySchema.parse(req.query);
  const statuses = query.status
    ? query.status
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : null;

  const orders = await listOrdersBySession({ sessionId, statuses });
  return ok(res, orders);
};

export const createDraftOrderHandler = async (req, res) => {
  const { sessionId } = sessionParamSchema.parse(req.params);
  const payload = createDraftSchema.parse(req.body || {});

  const order = await createOrGetDraftOrder({
    sessionId,
    notes: payload.notes,
    createdBy: req.user.user_id,
  });

  return created(res, order, "Draft order ready");
};

export const addOrderItemHandler = async (req, res) => {
  const { orderId } = orderParamSchema.parse(req.params);
  const payload = addItemSchema.parse(req.body);

  const item = await addOrderItem({
    orderId,
    menuItemId: payload.menu_item_id,
    quantity: payload.quantity,
    selectedOptions: payload.selected_options || {},
    note: payload.note || "",
    addedBy: req.user.user_id,
  });

  return created(res, item, "Item added");
};

export const updateOrderItemHandler = async (req, res) => {
  const { orderId, itemId } = orderItemParamSchema.parse(req.params);
  const payload = updateItemSchema.parse(req.body);

  const item = await updateOrderItem({
    orderId,
    orderItemId: itemId,
    quantity: payload.quantity,
    note: payload.note,
    updatedBy: req.user.user_id,
  });

  return ok(res, item, "Item updated");
};

export const removeOrderItemHandler = async (req, res) => {
  const { orderId, itemId } = orderItemParamSchema.parse(req.params);
  await removeOrderItem({
    orderId,
    orderItemId: itemId,
    removedBy: req.user.user_id,
  });

  return ok(res, null, "Item removed");
};

export const confirmOrderHandler = async (req, res) => {
  const { orderId } = orderParamSchema.parse(req.params);
  const order = await confirmOrder({
    orderId,
    confirmedBy: req.user.user_id,
  });
  return ok(res, order, "Order sent to kitchen");
};

export const getOrderDetailHandler = async (req, res) => {
  const { orderId } = orderParamSchema.parse(req.params);
  const order = await getOrderDetail(orderId);
  return ok(res, order);
};

export const createOrderItemChangeRequestHandler = async (req, res) => {
  const { orderId, itemId } = changeRequestParamSchema.parse(req.params);
  const payload = changeRequestSchema.parse(req.body);

  const changeRequest = await createOrderItemChangeRequest({
    orderId,
    orderItemId: itemId,
    requestType: payload.request_type,
    requestedQuantity: payload.requested_quantity,
    requestedNote: payload.requested_note,
    reason: payload.reason,
    requestedBy: req.user.user_id,
  });

  return created(res, changeRequest, "Change request submitted");
};

export const listOrderChangeRequestsHandler = async (req, res) => {
  const { orderId } = orderParamSchema.parse(req.params);
  const query = changeRequestQuerySchema.parse(req.query);
  const status = query.status
    ? query.status
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : null;

  const requests = await listOrderChangeRequests({
    orderId,
    status,
  });

  return ok(res, requests);
};
