import type { Prisma } from "@prisma/client";
import { mapAuditLogRecord } from "../../mappers/prismaRecords.js";
import type { AuditLog } from "../../types.js";
import type { RepositoryContext } from "../context.js";

export interface AuditLogFilters {
  resourceType?: string;
  action?: string;
}

export interface CreateAuditLogInput {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

export class AuditRepository {
  constructor(private readonly context: RepositoryContext) {}

  withContext(context: RepositoryContext): AuditRepository {
    return new AuditRepository(context);
  }

  async list(filters: AuditLogFilters = {}): Promise<AuditLog[]> {
    const records = await this.context.prisma.auditLog.findMany({
      where: {
        resourceType: filters.resourceType,
        action: filters.action
      },
      orderBy: { createdAt: "desc" }
    });

    return records.map(mapAuditLogRecord);
  }

  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const record = await this.context.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: input.metadata as Prisma.InputJsonObject | undefined
      }
    });

    return mapAuditLogRecord(record);
  }
}
