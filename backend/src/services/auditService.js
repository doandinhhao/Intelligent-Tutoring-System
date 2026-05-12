import { query } from "../database/db.js";

export const writeAuditLog = async ({
  actorUserId,
  actionKey,
  entityTypeKey,
  entityId,
  resultKey = "success",
  reason = "",
  beforeJson = null,
  afterJson = null,
}) => {
  const result = await query(
    `
    INSERT INTO audit_logs (
      actor_user_id,
      action_key,
      entity_type_key,
      entity_id,
      result_key,
      reason,
      before_json,
      after_json,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, NOW())
    RETURNING audit_log_id
    `,
    [
      actorUserId,
      actionKey,
      entityTypeKey,
      entityId,
      resultKey,
      reason,
      beforeJson ? JSON.stringify(beforeJson) : null,
      afterJson ? JSON.stringify(afterJson) : null,
    ],
  );

  return result.rows[0].audit_log_id;
};

