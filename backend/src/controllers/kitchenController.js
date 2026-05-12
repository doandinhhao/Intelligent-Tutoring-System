import { z } from "zod";
import { ok } from "../helpers/http.js";
import {
  listKitchenItems,
  markKitchenItemServed,
  updateKitchenItemStatus,
} from "../services/kitchenService.js";
import {
  listKitchenChangeRequests,
  reviewOrderItemChangeRequest,
} from "../services/orderChangeRequestService.js";

const querySchema = z.object({
  status: z.string().optional(),
});

const itemParamSchema = z.object({
  itemId: z.coerce.number().int().positive(),
});

const updateStatusSchema = z.object({
  status: z.enum(["cooking", "ready", "cancelled"]),
});

const changeRequestQuerySchema = z.object({
  status: z.string().optional(),
});

const changeRequestParamSchema = z.object({
  requestId: z.coerce.number().int().positive(),
});

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  kitchen_note: z.string().trim().max(500).optional(),
});

export const getKitchenItemsHandler = async (req, res) => {
  const query = querySchema.parse(req.query);
  const data = await listKitchenItems({ status: query.status });
  return ok(res, data);
};

export const updateKitchenItemStatusHandler = async (req, res) => {
  const { itemId } = itemParamSchema.parse(req.params);
  const payload = updateStatusSchema.parse(req.body);

  const item = await updateKitchenItemStatus({
    itemId,
    nextStatus: payload.status,
    actorUserId: req.user.user_id,
  });

  return ok(res, item, "Kitchen status updated");
};

export const markKitchenItemServedHandler = async (req, res) => {
  const { itemId } = itemParamSchema.parse(req.params);
  const item = await markKitchenItemServed({
    itemId,
    actorUserId: req.user.user_id,
  });
  return ok(res, item, "Item marked as served");
};

export const getKitchenChangeRequestsHandler = async (req, res) => {
  const query = changeRequestQuerySchema.parse(req.query);
  const status = query.status
    ? query.status
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : null;

  const requests = await listKitchenChangeRequests({ status });
  return ok(res, requests);
};

export const reviewKitchenChangeRequestHandler = async (req, res) => {
  const { requestId } = changeRequestParamSchema.parse(req.params);
  const payload = reviewSchema.parse(req.body);

  const reviewed = await reviewOrderItemChangeRequest({
    changeRequestId: requestId,
    decision: payload.decision,
    kitchenNote: payload.kitchen_note,
    reviewedBy: req.user.user_id,
  });

  return ok(res, reviewed, `Request ${payload.decision}`);
};
