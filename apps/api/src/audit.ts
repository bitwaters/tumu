import type { AuditLog, Store } from "./types.js";
import { newId } from "./data.js";

export function writeAudit(
  store: Store,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, unknown>
): AuditLog {
  const log: AuditLog = {
    id: newId("audit"),
    actorId,
    action,
    resourceType,
    resourceId,
    metadata,
    createdAt: new Date().toISOString()
  };
  store.auditLogs.unshift(log);
  return log;
}
