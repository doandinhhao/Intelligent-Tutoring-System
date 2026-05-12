import { z } from "zod";
import { created, ok } from "../helpers/http.js";
import {
  inviteSessionForPayment,
  listTablesWithState,
  openTableSession,
} from "../services/tableService.js";

const openSessionSchema = z.object({
  table_id: z.coerce.number().int().positive(),
  customer_name: z.string().trim().max(150).optional(),
  customer_phone: z.string().trim().max(30).optional(),
  party_size: z.coerce.number().int().min(1).max(20).optional(),
  notes: z.string().trim().max(255).optional(),
});

const sessionParamSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
});

export const listTablesHandler = async (_req, res) => {
  const data = await listTablesWithState();
  return ok(res, data);
};

export const openTableSessionHandler = async (req, res) => {
  const payload = openSessionSchema.parse(req.body);

  const session = await openTableSession({
    tableId: payload.table_id,
    customerName: payload.customer_name,
    customerPhone: payload.customer_phone,
    partySize: payload.party_size,
    notes: payload.notes,
    openedBy: req.user.user_id,
  });

  return created(res, session, "Table session ready");
};

export const inviteSessionForPaymentHandler = async (req, res) => {
  const { sessionId } = sessionParamSchema.parse(req.params);
  const session = await inviteSessionForPayment({
    sessionId,
    invitedBy: req.user.user_id,
  });

  return ok(res, session, "Session marked as awaiting payment");
};
