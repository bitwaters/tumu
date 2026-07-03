import { equal, rejects } from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../config.js";
import type { AuditRepository } from "../repositories/audit/index.js";
import type { IdempotencyRepository } from "../repositories/idempotency/index.js";
import type { NotificationsRepository } from "../repositories/notifications/index.js";
import type { SiteItemsRepository } from "../repositories/site-items/index.js";
import { IdempotencyService } from "../services/idempotency/index.js";
import { SiteItemsService } from "../services/site-items/index.js";
import type { AuditLog, IdempotencyRecord, Notification, Organization, PhotoAttachment, SiteItem, User, WorkflowLog } from "../types.js";

const supervisor: User = {
  id: "u-supervisor",
  organizationId: "org-supervisor",
  name: "监理工程师 王工",
  phone: "13800000001",
  username: "wang.supervisor",
  role: "supervisor",
  isActive: true,
  sectionScopeIds: ["sec-a"],
  passwordHash: "hash"
};

const rectifier: User = {
  id: "u-rectifier",
  organizationId: "org-contractor",
  name: "整改人 赵师傅",
  phone: "13800000002",
  username: "zhao.fix",
  role: "rectifier",
  isActive: true,
  sectionScopeIds: ["sec-a"],
  passwordHash: "hash"
};

test("site item create rolls back item, photo binding, workflow, audit and idempotency on photo binding failure", async () => {
  const state = createSiteItemState({
    photos: [
      createPhoto({ id: "photo-owned", uploadedBy: supervisor.id }),
      createPhoto({ id: "photo-other", uploadedBy: rectifier.id })
    ]
  });
  const service = createSiteItemsService(state);

  await rejects(() =>
    service.create(
      supervisor,
      createInput({ photoIds: ["photo-owned", "photo-other"] }),
      { method: "POST", path: "/site-items", key: "create-rollback" }
    )
  );

  equal(state.items.length, 0);
  equal(state.photos.find((photo) => photo.id === "photo-owned")?.siteItemId, undefined);
  equal(state.workflowLogs.length, 0);
  equal(state.auditLogs.length, 0);
  equal(state.idempotencyRecords.length, 0);
});

test("site item create replays idempotent response without duplicate item creation", async () => {
  const state = createSiteItemState({
    photos: [createPhoto({ id: "photo-owned", uploadedBy: supervisor.id })]
  });
  const service = createSiteItemsService(state);
  const input = createInput({ photoIds: ["photo-owned"] });

  const first = await service.create(supervisor, input, { method: "POST", path: "/site-items", key: "create-once" });
  const second = await service.create(supervisor, input, { method: "POST", path: "/site-items", key: "create-once" });

  equal(first.id, second.id);
  equal(state.items.length, 1);
  equal(state.workflowLogs.length, 1);
  equal(state.auditLogs.length, 1);
  equal(state.idempotencyRecords.length, 1);
});

test("site item workflow binds photos and writes notifications, workflow logs and audit records", async () => {
  const item = createItem({
    id: "item-1",
    status: "rectifying",
    ownerUserId: supervisor.id,
    responsibleOrgId: rectifier.organizationId,
    responsibleUserId: rectifier.id
  });
  const state = createSiteItemState({
    items: [item],
    photos: [
      createPhoto({ id: "photo-rectification", uploadedBy: rectifier.id }),
      createPhoto({ id: "photo-review", uploadedBy: supervisor.id })
    ]
  });
  const service = createSiteItemsService(state);

  await service.transition(
    rectifier,
    item.id,
    "submit_review",
    { photoIds: ["photo-rectification"] },
    { method: "POST", path: "/site-items/item-1/submit-review", key: "submit-review" }
  );
  await service.transition(
    supervisor,
    item.id,
    "close",
    { photoIds: ["photo-review"] },
    { method: "POST", path: "/site-items/item-1/close", key: "close" }
  );

  equal(state.items[0]?.status, "closed");
  equal(state.photos.find((photo) => photo.id === "photo-rectification")?.stage, "rectification");
  equal(state.photos.find((photo) => photo.id === "photo-review")?.stage, "review");
  equal(state.notifications[0]?.type, "review_requested");
  equal(state.notifications[0]?.recipientId, supervisor.id);
  equal(state.workflowLogs.length, 2);
  equal(state.auditLogs.map((log) => log.action).join(","), "submit_review,close");
});

interface SiteItemState {
  items: SiteItem[];
  photos: PhotoAttachment[];
  workflowLogs: WorkflowLog[];
  auditLogs: AuditLog[];
  notifications: Notification[];
  idempotencyRecords: IdempotencyRecord[];
  organizations: Organization[];
  users: User[];
}

function createSiteItemsService(state: SiteItemState): SiteItemsService {
  const repository = createSiteItemsRepository(state);
  const auditRepository = createAuditRepository(state);
  const idempotencyRepository = createIdempotencyRepository(state);
  const notificationsRepository = createNotificationsRepository(state);
  return new SiteItemsService(
    repository,
    auditRepository,
    new IdempotencyService(idempotencyRepository, loadConfig()),
    notificationsRepository
  );
}

function createSiteItemsRepository(state: SiteItemState): SiteItemsRepository {
  const repository = {
    withContext: () => repository,
    transaction: async <T>(callback: (context: unknown) => Promise<T>) => {
      const snapshot = cloneState(state);
      try {
        return await callback({});
      } catch (error) {
        restoreState(state, snapshot);
        throw error;
      }
    },
    findDefaultProjectId: async () => "project",
    existsActiveSection: async (sectionId: string) => sectionId === "sec-a",
    existsActiveArea: async (areaId: string) => areaId === "area-main",
    existsActiveDiscipline: async (disciplineId: string) => disciplineId === "disc-civil",
    findOrganizationById: async (organizationId: string) => state.organizations.find((organization) => organization.id === organizationId),
    findUserById: async (userId: string) => state.users.find((user) => user.id === userId),
    nextItemNo: async () => `ITEM-2026-${String(state.items.length + 1).padStart(4, "0")}`,
    create: async (input: Parameters<SiteItemsRepository["create"]>[0]) => {
      const item = createItem({
        ...input,
        id: `item-${state.items.length + 1}`,
        defaultDueAt: input.defaultDueAt.toISOString(),
        dueAt: input.dueAt.toISOString()
      });
      state.items.unshift(item);
      return item;
    },
    update: async (itemId: string, input: Parameters<SiteItemsRepository["update"]>[1]) => {
      const item = state.items.find((candidate) => candidate.id === itemId);
      if (!item) return undefined;
      Object.assign(item, {
        ...input,
        dueAt: input.dueAt?.toISOString() ?? item.dueAt,
        updatedAt: new Date("2026-06-25T08:33:00.000Z").toISOString()
      });
      return item;
    },
    updateWorkflow: async (itemId: string, input: Parameters<SiteItemsRepository["updateWorkflow"]>[1]) => {
      const item = state.items.find((candidate) => candidate.id === itemId);
      if (!item) return undefined;
      Object.assign(item, {
        ...input,
        submittedForReviewAt: input.submittedForReviewAt?.toISOString() ?? item.submittedForReviewAt,
        closedAt: input.closedAt?.toISOString() ?? item.closedAt,
        reopenedAt: input.reopenedAt?.toISOString() ?? item.reopenedAt,
        voidedAt: input.voidedAt?.toISOString() ?? item.voidedAt,
        updatedAt: new Date("2026-06-25T08:34:00.000Z").toISOString()
      });
      return item;
    },
    bindUnboundPhotos: async (viewer: User, item: SiteItem, photoIds: string[], stage: PhotoAttachment["stage"]) => {
      const bound: PhotoAttachment[] = [];
      for (const photoId of photoIds) {
        const photo = state.photos.find((candidate) => candidate.id === photoId);
        if (!photo || photo.deletedAt || photo.uploadedBy !== viewer.id || photo.siteItemId) {
          throw new Error("Photo cannot be bound");
        }
        Object.assign(photo, {
          siteItemId: item.id,
          stage,
          sectionSnapshot: "土建一标",
          areaSnapshot: "主厂房",
          disciplineSnapshot: "土建",
          responsibleOrgSnapshot: "中建土建施工一队"
        });
        bound.push(photo);
      }
      return bound;
    },
    createWorkflowLog: async (input: Parameters<SiteItemsRepository["createWorkflowLog"]>[0]) => {
      const log: WorkflowLog = {
        id: `log-${state.workflowLogs.length + 1}`,
        siteItemId: input.siteItemId,
        action: input.action,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorId: input.actorId,
        comment: input.comment,
        createdAt: new Date("2026-06-25T08:35:00.000Z").toISOString()
      };
      state.workflowLogs.unshift(log);
      return log;
    },
    findDetailById: async (_viewer: User, itemId: string) => {
      const item = state.items.find((candidate) => candidate.id === itemId);
      if (!item) return undefined;
      return {
        item,
        photos: state.photos.filter((photo) => photo.siteItemId === itemId && !photo.deletedAt),
        workflowLogs: state.workflowLogs.filter((log) => log.siteItemId === itemId)
      };
    },
    list: async () => state.items
  } as unknown as SiteItemsRepository;
  return repository;
}

function createAuditRepository(state: SiteItemState): AuditRepository {
  const repository = {
    withContext: () => repository,
    create: async (input: Parameters<AuditRepository["create"]>[0]) => {
      const log: AuditLog = {
        id: `audit-${state.auditLogs.length + 1}`,
        actorId: input.actorId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: input.metadata,
        createdAt: new Date("2026-06-25T08:36:00.000Z").toISOString()
      };
      state.auditLogs.push(log);
      return log;
    }
  } as unknown as AuditRepository;
  return repository;
}

function createNotificationsRepository(state: SiteItemState): NotificationsRepository {
  const repository = {
    withContext: () => repository,
    create: async (input: Parameters<NotificationsRepository["create"]>[0]) => {
      const notification: Notification = {
        id: `notice-${state.notifications.length + 1}`,
        recipientId: input.recipientId,
        siteItemId: input.siteItemId,
        type: input.type,
        title: input.title,
        content: input.content,
        createdAt: new Date("2026-06-25T08:37:00.000Z").toISOString()
      };
      state.notifications.unshift(notification);
      return notification;
    }
  } as unknown as NotificationsRepository;
  return repository;
}

function createIdempotencyRepository(state: SiteItemState): IdempotencyRepository {
  const repository = {
    withContext: () => repository,
    acquireTransactionLock: async () => undefined,
    find: async (input: Parameters<IdempotencyRepository["find"]>[0]) =>
      state.idempotencyRecords.find(
        (record) => record.actorId === input.actorId && record.method === input.method && record.path === input.path && record.key === input.key
      ),
    create: async (input: Parameters<IdempotencyRepository["create"]>[0]) => {
      const record: IdempotencyRecord = {
        id: `idem-${state.idempotencyRecords.length + 1}`,
        actorId: input.actorId,
        method: input.method,
        path: input.path,
        key: input.key,
        requestHash: input.requestHash,
        responseStatus: input.responseStatus,
        responseBody: input.responseBody,
        createdAt: new Date("2026-06-25T08:38:00.000Z").toISOString(),
        expiresAt: input.expiresAt.toISOString()
      };
      state.idempotencyRecords.push(record);
      return record;
    }
  } as unknown as IdempotencyRepository;
  return repository;
}

function createSiteItemState(input: Partial<SiteItemState> = {}): SiteItemState {
  return {
    items: [],
    photos: [],
    workflowLogs: [],
    auditLogs: [],
    notifications: [],
    idempotencyRecords: [],
    organizations: [
      { id: "org-supervisor", projectId: "project", name: "监理单位", type: "supervisor", isActive: true },
      { id: "org-contractor", projectId: "project", name: "中建土建施工一队", type: "contractor", isActive: true }
    ],
    users: [supervisor, rectifier],
    ...input
  };
}

function createInput(input: Partial<Parameters<SiteItemsService["create"]>[1]> = {}): Parameters<SiteItemsService["create"]>[1] {
  return {
    sectionId: "sec-a",
    type: "defect",
    severity: "important",
    title: "主厂房 A 轴柱脚混凝土蜂窝需修补",
    description: "A 轴 3-4 轴之间柱脚局部蜂窝麻面。",
    areaId: "area-main",
    disciplineId: "disc-civil",
    locationText: "A 轴 3-4 轴",
    responsibleOrgId: "org-contractor",
    responsibleUserId: rectifier.id,
    ...input
  };
}

function createItem(input: Partial<SiteItem> & { id: string }): SiteItem {
  return {
    projectId: "project",
    sectionId: "sec-a",
    itemNo: "ITEM-2026-0001",
    type: "defect",
    status: "pending_approval",
    severity: "important",
    title: "主厂房 A 轴柱脚混凝土蜂窝需修补",
    description: "A 轴 3-4 轴之间柱脚局部蜂窝麻面。",
    areaId: "area-main",
    disciplineId: "disc-civil",
    locationText: "A 轴 3-4 轴",
    createdBy: supervisor.id,
    ownerUserId: supervisor.id,
    defaultDueAt: new Date("2026-06-28T08:30:00.000Z").toISOString(),
    dueAt: new Date("2026-06-28T08:30:00.000Z").toISOString(),
    createdAt: new Date("2026-06-25T08:30:00.000Z").toISOString(),
    updatedAt: new Date("2026-06-25T08:30:00.000Z").toISOString(),
    ...input
  };
}

function createPhoto(input: Partial<PhotoAttachment> & { id: string; uploadedBy: string }): PhotoAttachment {
  return {
    objectKey: `uploads/${input.uploadedBy}/${input.id}.jpg`,
    thumbnailKey: `uploads/${input.uploadedBy}/${input.id}.jpg`,
    fileName: `${input.id}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    uploadedAt: new Date("2026-06-25T08:30:00.000Z").toISOString(),
    ...input
  };
}

function cloneState(state: SiteItemState): SiteItemState {
  return structuredClone(state);
}

function restoreState(target: SiteItemState, source: SiteItemState): void {
  target.items = source.items;
  target.photos = source.photos;
  target.workflowLogs = source.workflowLogs;
  target.auditLogs = source.auditLogs;
  target.notifications = source.notifications;
  target.idempotencyRecords = source.idempotencyRecords;
  target.organizations = source.organizations;
  target.users = source.users;
}
