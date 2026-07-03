import type { Prisma } from "@prisma/client";
import type { IdempotencyRecord } from "../../types.js";
import type { RepositoryContext } from "../context.js";

export interface IdempotencyLookup {
  actorId: string;
  method: string;
  path: string;
  key: string;
}

export interface CreateIdempotencyRecordInput extends IdempotencyLookup {
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  expiresAt: Date;
}

export class IdempotencyRepository {
  constructor(private readonly context: RepositoryContext) {}

  withContext(context: RepositoryContext): IdempotencyRepository {
    return new IdempotencyRepository(context);
  }

  async find(input: IdempotencyLookup): Promise<IdempotencyRecord | undefined> {
    const record = await this.context.prisma.idempotencyRecord.findUnique({
      where: {
        actorId_method_path_key: input
      }
    });

    return record ? mapIdempotencyRecord(record) : undefined;
  }

  async acquireTransactionLock(input: IdempotencyLookup): Promise<void> {
    const prisma = this.context.prisma;
    if (!("$executeRaw" in prisma)) return;
    const lockKey = `${input.actorId}:${input.method}:${input.path}:${input.key}`;
    await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  }

  async create(input: CreateIdempotencyRecordInput): Promise<IdempotencyRecord> {
    const record = await this.context.prisma.idempotencyRecord.create({
      data: {
        actorId: input.actorId,
        method: input.method,
        path: input.path,
        key: input.key,
        requestHash: input.requestHash,
        responseStatus: input.responseStatus,
        responseBody: input.responseBody as Prisma.InputJsonValue,
        expiresAt: input.expiresAt
      }
    });

    return mapIdempotencyRecord(record);
  }

  async delete(input: IdempotencyLookup): Promise<void> {
    await this.context.prisma.idempotencyRecord.delete({
      where: {
        actorId_method_path_key: input
      }
    });
  }
}

interface IdempotencyRecordPrisma {
  id: string;
  actorId: string;
  method: string;
  path: string;
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
  expiresAt: Date;
}

function mapIdempotencyRecord(record: IdempotencyRecordPrisma): IdempotencyRecord {
  return {
    id: record.id,
    actorId: record.actorId,
    method: record.method,
    path: record.path,
    key: record.key,
    requestHash: record.requestHash,
    responseStatus: record.responseStatus,
    responseBody: record.responseBody,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString()
  };
}
