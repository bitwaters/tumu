import { equal, rejects } from "node:assert/strict";
import { test } from "node:test";
import { AuditRepository } from "../repositories/audit/index.js";
import { DrawingsRepository } from "../repositories/drawings/index.js";
import { DrawingsService } from "../services/drawings/index.js";
import type { User } from "../types.js";

const admin: User = {
  id: "u-admin",
  organizationId: "org-owner",
  name: "管理员",
  phone: "13800000000",
  username: "admin",
  role: "admin",
  isActive: true,
  sectionScopeIds: ["sec-a"],
  passwordHash: "hash"
};

test("drawing revision upload rolls back when audit creation fails", async () => {
  const state = createDrawingPrismaState();
  const prisma = createDrawingPrismaStub(state, { failAuditCreate: true });
  const service = new DrawingsService(new DrawingsRepository({ prisma }), new AuditRepository({ prisma }));

  await rejects(() =>
    service.createRevision(admin, {
      drawingId: "drawing-1",
      revisionNo: "A",
      fileKey: "drawings/main-a.pdf",
      pageCount: 2,
      isCurrent: true
    })
  );

  equal(state.revisions.length, 0);
  equal(state.auditLogs.length, 0);
});

interface DrawingPrismaState {
  revisions: DrawingRevisionRecordStub[];
  auditLogs: AuditLogRecordStub[];
}

interface DrawingRevisionRecordStub {
  id: string;
  drawingId: string;
  revisionNo: string;
  fileKey: string;
  coverPreviewKey: string;
  pageCount: number;
  uploadedBy: string;
  uploadedAt: Date;
  isCurrent: boolean;
  pages: DrawingRevisionPageRecordStub[];
}

interface DrawingRevisionPageRecordStub {
  id: string;
  drawingRevisionId: string;
  pageNumber: number;
  previewKey: string;
  width: number;
  height: number;
}

interface AuditLogRecordStub {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: unknown;
  createdAt: Date;
}

function createDrawingPrismaState(): DrawingPrismaState {
  return {
    revisions: [],
    auditLogs: []
  };
}

function createDrawingPrismaStub(state: DrawingPrismaState, options: { failAuditCreate?: boolean } = {}) {
  const transactionClient = {
    drawingRevision: {
      updateMany: async ({ where, data }: { where: { drawingId: string }; data: { isCurrent: boolean } }) => {
        for (const revision of state.revisions) {
          if (revision.drawingId === where.drawingId) revision.isCurrent = data.isCurrent;
        }
        return { count: state.revisions.length };
      },
      create: async ({ data }: { data: DrawingRevisionCreateDataStub }) => {
        const id = `rev-${state.revisions.length + 1}`;
        const record: DrawingRevisionRecordStub = {
          id,
          drawingId: data.drawingId,
          revisionNo: data.revisionNo,
          fileKey: data.fileKey,
          coverPreviewKey: data.coverPreviewKey,
          pageCount: data.pageCount,
          uploadedBy: data.uploadedBy,
          uploadedAt: new Date("2026-06-25T08:30:00.000Z"),
          isCurrent: data.isCurrent,
          pages: data.pages.create.map((page, index) => ({
            id: `page-${index + 1}`,
            drawingRevisionId: id,
            pageNumber: page.pageNumber,
            previewKey: page.previewKey,
            width: page.width,
            height: page.height
          }))
        };
        state.revisions.push(record);
        return record;
      },
      findUnique: async () => undefined
    },
    auditLog: {
      create: async ({ data }: { data: Omit<AuditLogRecordStub, "id" | "createdAt"> }) => {
        if (options.failAuditCreate) throw new Error("audit write failed");
        const record = {
          id: `audit-${state.auditLogs.length + 1}`,
          ...data,
          createdAt: new Date("2026-06-25T08:31:00.000Z")
        };
        state.auditLogs.push(record);
        return record;
      }
    }
  };

  return {
    ...transactionClient,
    $transaction: async <T>(callback: (client: typeof transactionClient) => Promise<T>) => {
      const snapshot = cloneDrawingPrismaState(state);
      try {
        return await callback(transactionClient);
      } catch (error) {
        state.revisions = snapshot.revisions;
        state.auditLogs = snapshot.auditLogs;
        throw error;
      }
    }
  } as never;
}

interface DrawingRevisionCreateDataStub {
  drawingId: string;
  revisionNo: string;
  fileKey: string;
  coverPreviewKey: string;
  pageCount: number;
  uploadedBy: string;
  isCurrent: boolean;
  pages: {
    create: Array<{
      pageNumber: number;
      previewKey: string;
      width: number;
      height: number;
    }>;
  };
}

function cloneDrawingPrismaState(state: DrawingPrismaState): DrawingPrismaState {
  return {
    revisions: state.revisions.map((revision) => ({
      ...revision,
      uploadedAt: new Date(revision.uploadedAt),
      pages: revision.pages.map((page) => ({ ...page }))
    })),
    auditLogs: state.auditLogs.map((auditLog) => ({
      ...auditLog,
      createdAt: new Date(auditLog.createdAt)
    }))
  };
}
