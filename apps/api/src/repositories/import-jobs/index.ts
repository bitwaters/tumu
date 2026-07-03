import type { Prisma } from "@prisma/client";
import { mapImportJobRecord } from "../../mappers/prismaRecords.js";
import type { ImportJob, ImportKind, ImportRowError, ImportStatus } from "../../types.js";
import type { RepositoryContext } from "../context.js";

export interface CreateImportJobInput {
  id?: string;
  kind: ImportKind;
  status?: ImportStatus;
  requestedBy: string;
  sourceFileName?: string;
  acceptedRows?: number;
  rejectedRows?: number;
  errors?: ImportRowError[];
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface UpdateImportJobInput {
  status?: ImportStatus;
  acceptedRows?: number;
  rejectedRows?: number;
  errors?: ImportRowError[];
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export class ImportJobsRepository {
  constructor(private readonly context: RepositoryContext) {}

  async create(input: CreateImportJobInput): Promise<ImportJob> {
    const record = await this.context.prisma.importJob.create({
      data: {
        id: input.id,
        kind: input.kind,
        status: input.status ?? "queued",
        requestedBy: input.requestedBy,
        sourceFileName: input.sourceFileName,
        acceptedRows: input.acceptedRows ?? 0,
        rejectedRows: input.rejectedRows ?? 0,
        errors: toJsonErrors(input.errors ?? []),
        errorMessage: input.errorMessage,
        startedAt: input.startedAt,
        completedAt: input.completedAt
      }
    });
    return mapImportJobRecord(record);
  }

  async update(jobId: string, input: UpdateImportJobInput): Promise<ImportJob | undefined> {
    const exists = await this.context.prisma.importJob.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!exists) return undefined;
    const record = await this.context.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: input.status,
        acceptedRows: input.acceptedRows,
        rejectedRows: input.rejectedRows,
        errors: input.errors ? toJsonErrors(input.errors) : undefined,
        errorMessage: input.errorMessage,
        startedAt: input.startedAt,
        completedAt: input.completedAt
      }
    });
    return mapImportJobRecord(record);
  }

  async findById(jobId: string): Promise<ImportJob | undefined> {
    const record = await this.context.prisma.importJob.findUnique({ where: { id: jobId } });
    return record ? mapImportJobRecord(record) : undefined;
  }
}

function toJsonErrors(errors: ImportRowError[]): Prisma.InputJsonArray {
  return errors.map((error) => ({
    rowNumber: error.rowNumber,
    field: error.field,
    message: error.message
  })) as Prisma.InputJsonArray;
}
