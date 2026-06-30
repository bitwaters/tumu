import type { ApiRequest } from "./http.js";
import type { ApiConfig } from "./config.js";
import type { IdempotencyRecord, Store } from "./types.js";
import { conflict } from "./errors.js";
import { newId } from "./data.js";
import { stableHash } from "./security.js";

export async function withIdempotency<T>(
  store: Store,
  config: ApiConfig,
  request: ApiRequest,
  actorId: string,
  handler: () => Promise<{ status?: number; body: T }> | { status?: number; body: T }
): Promise<T> {
  const keyHeader = request.headers["idempotency-key"];
  const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;
  if (!key) return (await handler()).body;

  const requestHash = stableHash(request.body ?? null);
  const existing = store.idempotencyRecords.find(
    (record) => record.actorId === actorId && record.method === request.method && record.path === request.path && record.key === key
  );
  if (existing) {
    if (existing.requestHash !== requestHash) throw conflict("Idempotency key reused with different request body");
    return existing.responseBody as T;
  }

  const result = await handler();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.idempotencyTtlHours * 60 * 60 * 1000);
  const record: IdempotencyRecord = {
    id: newId("idem"),
    actorId,
    method: request.method,
    path: request.path,
    key,
    requestHash,
    responseStatus: result.status ?? 200,
    responseBody: result.body,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
  store.idempotencyRecords.push(record);
  return result.body;
}
