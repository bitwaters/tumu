import type { Prisma } from "@prisma/client";
import { mapDrawingPageRecord, mapDrawingRecord, mapDrawingRevisionRecord } from "../../mappers/prismaRecords.js";
import type { Drawing, DrawingRevision, DrawingRevisionPage, User } from "../../types.js";
import type { RepositoryContext } from "../context.js";
import { siteItemVisibilityWhere } from "../visibility.js";

const drawingWithRevisions = {
  revisions: {
    orderBy: [{ isCurrent: "desc" }, { uploadedAt: "desc" }],
    include: {
      pages: {
        orderBy: { pageNumber: "asc" }
      }
    }
  }
} satisfies Prisma.DrawingInclude;

export interface DrawingListFilters {
  areaId?: string;
  disciplineId?: string;
  search?: string;
}

export interface CreateDrawingInput {
  projectId: string;
  areaId: string;
  disciplineId?: string;
  name: string;
  code: string;
}

export interface UpdateDrawingInput {
  areaId?: string;
  disciplineId?: string | null;
  name?: string;
  code?: string;
  isActive?: boolean;
}

export interface CreateDrawingRevisionInput {
  drawingId: string;
  revisionNo: string;
  fileKey: string;
  coverPreviewKey?: string;
  pageCount: number;
  uploadedBy: string;
  isCurrent?: boolean;
}

export class DrawingsRepository {
  constructor(private readonly context: RepositoryContext) {}

  async findDefaultProjectId(): Promise<string | undefined> {
    const project = await this.context.prisma.project.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" }
    });
    return project?.id;
  }

  async list(filters: DrawingListFilters = {}): Promise<Drawing[]> {
    const records = await this.context.prisma.drawing.findMany({
      where: {
        isActive: true,
        areaId: filters.areaId,
        disciplineId: filters.disciplineId,
        OR: filters.search
          ? [
              { name: { contains: filters.search, mode: "insensitive" } },
              { code: { contains: filters.search, mode: "insensitive" } }
            ]
          : undefined
      },
      include: drawingWithRevisions,
      orderBy: { code: "asc" }
    });

    return records.map(mapDrawingRecord);
  }

  async findById(drawingId: string): Promise<Drawing | undefined> {
    const record = await this.context.prisma.drawing.findUnique({
      where: { id: drawingId },
      include: drawingWithRevisions
    });

    return record ? mapDrawingRecord(record) : undefined;
  }

  async listRevisions(drawingId: string): Promise<DrawingRevision[]> {
    const records = await this.context.prisma.drawingRevision.findMany({
      where: { drawingId },
      include: {
        pages: {
          orderBy: { pageNumber: "asc" }
        }
      },
      orderBy: [{ isCurrent: "desc" }, { uploadedAt: "desc" }]
    });

    return records.map(mapDrawingRevisionRecord);
  }

  async findRevision(revisionId: string): Promise<{ drawing: Drawing; revision: DrawingRevision } | undefined> {
    const record = await this.context.prisma.drawingRevision.findUnique({
      where: { id: revisionId },
      include: {
        pages: {
          orderBy: { pageNumber: "asc" }
        }
      }
    });

    if (!record) return undefined;
    const drawing = await this.findById(record.drawingId);
    if (!drawing) return undefined;

    return {
      drawing,
      revision: mapDrawingRevisionRecord(record)
    };
  }

  async listPages(revisionId: string): Promise<DrawingRevisionPage[]> {
    const records = await this.context.prisma.drawingRevisionPage.findMany({
      where: { drawingRevisionId: revisionId },
      orderBy: { pageNumber: "asc" }
    });

    return records.map(mapDrawingPageRecord);
  }

  async hasVisibleItemForDrawing(user: User, drawing: Pick<Drawing, "areaId" | "disciplineId">): Promise<boolean> {
    const item = await this.context.prisma.siteItem.findFirst({
      where: {
        AND: [
          siteItemVisibilityWhere(user),
          {
            areaId: drawing.areaId,
            disciplineId: drawing.disciplineId ? drawing.disciplineId : undefined
          }
        ]
      },
      select: { id: true }
    });

    return Boolean(item);
  }

  async createDrawing(input: CreateDrawingInput): Promise<Drawing> {
    const record = await this.context.prisma.drawing.create({
      data: {
        ...input,
        disciplineId: input.disciplineId ?? null
      },
      include: drawingWithRevisions
    });

    return mapDrawingRecord(record);
  }

  async updateDrawing(drawingId: string, input: UpdateDrawingInput): Promise<Drawing | undefined> {
    const exists = await this.context.prisma.drawing.findUnique({ where: { id: drawingId }, select: { id: true } });
    if (!exists) return undefined;
    const record = await this.context.prisma.drawing.update({
      where: { id: drawingId },
      data: input,
      include: drawingWithRevisions
    });

    return mapDrawingRecord(record);
  }

  async createRevision(input: CreateDrawingRevisionInput): Promise<DrawingRevision> {
    return this.transaction(async ({ prisma }) => {
      if (input.isCurrent) {
        await prisma.drawingRevision.updateMany({
          where: { drawingId: input.drawingId },
          data: { isCurrent: false }
        });
      }

      const record = await prisma.drawingRevision.create({
        data: {
          drawingId: input.drawingId,
          revisionNo: input.revisionNo,
          fileKey: input.fileKey,
          coverPreviewKey: input.coverPreviewKey ?? `${input.fileKey}-p1`,
          pageCount: input.pageCount,
          uploadedBy: input.uploadedBy,
          isCurrent: Boolean(input.isCurrent),
          pages: {
            create: Array.from({ length: input.pageCount }, (_, index) => ({
              pageNumber: index + 1,
              previewKey: `${input.fileKey}-p${index + 1}`,
              width: 1600,
              height: 1000
            }))
          }
        },
        include: {
          pages: {
            orderBy: { pageNumber: "asc" }
          }
        }
      });

      return mapDrawingRevisionRecord(record);
    });
  }

  async setCurrentRevision(revisionId: string): Promise<DrawingRevision | undefined> {
    return this.transaction(async ({ prisma }) => {
      const revision = await prisma.drawingRevision.findUnique({
        where: { id: revisionId },
        select: { id: true, drawingId: true }
      });
      if (!revision) return undefined;

      await prisma.drawingRevision.updateMany({
        where: { drawingId: revision.drawingId },
        data: { isCurrent: false }
      });

      const record = await prisma.drawingRevision.update({
        where: { id: revisionId },
        data: { isCurrent: true },
        include: {
          pages: {
            orderBy: { pageNumber: "asc" }
          }
        }
      });

      return mapDrawingRevisionRecord(record);
    });
  }

  async transaction<T>(callback: (context: RepositoryContext) => Promise<T>): Promise<T> {
    const prisma = this.context.prisma;
    if ("$transaction" in prisma) {
      return prisma.$transaction((transactionClient) => callback({ prisma: transactionClient }));
    }
    return callback(this.context);
  }
}
