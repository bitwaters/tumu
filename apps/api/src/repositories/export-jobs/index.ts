import type { Prisma } from "@prisma/client";
import { mapExportJobRecord } from "../../mappers/prismaRecords.js";
import type { ExportJob, ExportStatus, ExportType } from "../../types.js";
import type { RepositoryContext } from "../context.js";

export interface CreateExportJobInput {
  id?: string;
  type: ExportType;
  status?: ExportStatus;
  requestedBy: string;
  params?: Record<string, unknown>;
  artifactKey?: string;
  artifactFileName?: string;
  artifactMimeType?: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface UpdateExportJobInput {
  status?: ExportStatus;
  params?: Record<string, unknown>;
  artifactKey?: string;
  artifactFileName?: string;
  artifactMimeType?: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export class ExportJobsRepository {
  constructor(private readonly context: RepositoryContext) {}

  async create(input: CreateExportJobInput): Promise<ExportJob> {
    const record = await this.context.prisma.exportJob.create({
      data: {
        id: input.id,
        type: input.type,
        status: input.status ?? "queued",
        requestedBy: input.requestedBy,
        params: input.params as Prisma.InputJsonObject | undefined,
        artifactKey: input.artifactKey,
        artifactFileName: input.artifactFileName,
        artifactMimeType: input.artifactMimeType,
        errorMessage: input.errorMessage,
        startedAt: input.startedAt,
        completedAt: input.completedAt
      }
    });
    return mapExportJobRecord(record);
  }

  async update(jobId: string, input: UpdateExportJobInput): Promise<ExportJob | undefined> {
    const exists = await this.context.prisma.exportJob.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!exists) return undefined;
    const record = await this.context.prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: input.status,
        params: input.params as Prisma.InputJsonObject | undefined,
        artifactKey: input.artifactKey,
        artifactFileName: input.artifactFileName,
        artifactMimeType: input.artifactMimeType,
        errorMessage: input.errorMessage,
        startedAt: input.startedAt,
        completedAt: input.completedAt
      }
    });
    return mapExportJobRecord(record);
  }

  async findById(jobId: string): Promise<ExportJob | undefined> {
    const record = await this.context.prisma.exportJob.findUnique({ where: { id: jobId } });
    return record ? mapExportJobRecord(record) : undefined;
  }
}
