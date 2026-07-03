import type { ApiConfig } from "../../config.js";
import { conflict } from "../../errors.js";
import { IdempotencyRepository } from "../../repositories/idempotency/index.js";
import type { RepositoryContext } from "../../repositories/context.js";
import { stableHash } from "../../security.js";

export interface IdempotencyRequest {
  actorId: string;
  method: string;
  path: string;
  key?: string;
  requestBody: unknown;
}

export interface IdempotentResult<T> {
  status?: number;
  body: T;
}

export class IdempotencyService {
  constructor(
    private readonly repository: IdempotencyRepository,
    private readonly config: ApiConfig
  ) {}

  withContext(context: RepositoryContext): IdempotencyService {
    return new IdempotencyService(this.repository.withContext(context), this.config);
  }

  async run<T>(request: IdempotencyRequest, handler: () => Promise<IdempotentResult<T>> | IdempotentResult<T>): Promise<T> {
    if (!request.key) return (await handler()).body;

    const requestHash = stableHash(request.requestBody ?? null);
    const lookup = {
      actorId: request.actorId,
      method: request.method,
      path: request.path,
      key: request.key
    };
    await this.repository.acquireTransactionLock(lookup);
    const existing = await this.repository.find(lookup);
    if (existing) {
      if (isExpired(existing)) {
        await this.repository.delete(lookup);
      } else {
        return replay<T>(existing, requestHash);
      }
    }

    const result = await handler();
    const expiresAt = new Date(Date.now() + this.config.idempotencyTtlHours * 60 * 60 * 1000);
    try {
      await this.repository.create({
        ...lookup,
        requestHash,
        responseStatus: result.status ?? 200,
        responseBody: result.body,
        expiresAt
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const record = await this.repository.find(lookup);
      if (!record || isExpired(record)) throw error;
      return replay<T>(record, requestHash);
    }
    return result.body;
  }
}

function isExpired(record: { expiresAt: string }): boolean {
  return Date.parse(record.expiresAt) <= Date.now();
}

function replay<T>(record: { requestHash: string; responseBody: unknown }, requestHash: string): T {
  if (record.requestHash !== requestHash) throw conflict("Idempotency key reused with different request body");
  return record.responseBody as T;
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}
