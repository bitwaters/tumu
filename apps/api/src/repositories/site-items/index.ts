import type { Prisma } from "@prisma/client";
import {
  mapUserRecord,
  mapPhotoAttachmentRecord,
  mapSiteItemRecord,
  mapWorkflowLogRecord
} from "../../mappers/prismaRecords.js";
import { badRequest } from "../../errors.js";
import type { PhotoAttachment, PhotoStage, Severity, SiteItem, SiteItemStatus, SiteItemType, User, WorkflowAction, WorkflowLog } from "../../types.js";
import type { RepositoryContext } from "../context.js";
import { siteItemVisibilityWhere } from "../visibility.js";

export interface SiteItemListFilters {
  search?: string;
  status?: SiteItemStatus;
  type?: SiteItemType;
  severity?: Severity;
  sectionId?: string;
  areaId?: string;
  disciplineId?: string;
  organizationId?: string;
  overdue?: boolean;
}

export interface SiteItemDetailData {
  item: SiteItem;
  photos: PhotoAttachment[];
  workflowLogs: WorkflowLog[];
}

export interface CreateSiteItemRecordInput {
  projectId: string;
  sectionId: string;
  itemNo: string;
  type: SiteItemType;
  status: SiteItemStatus;
  severity: Severity;
  title: string;
  description: string;
  areaId: string;
  disciplineId: string;
  locationText: string;
  responsibleOrgId?: string;
  responsibleUserId?: string;
  createdBy: string;
  ownerUserId: string;
  defaultDueAt: Date;
  dueAt: Date;
}

export interface UpdateSiteItemRecordInput {
  type?: SiteItemType;
  severity?: Severity;
  title?: string;
  description?: string;
  sectionId?: string;
  areaId?: string;
  disciplineId?: string;
  locationText?: string;
  dueAt?: Date;
}

export interface UpdateSiteItemWorkflowInput {
  status?: SiteItemStatus;
  responsibleOrgId?: string;
  responsibleUserId?: string;
  submittedForReviewAt?: Date;
  closedAt?: Date;
  reopenedAt?: Date;
  voidedAt?: Date;
}

export interface WorkflowLogInput {
  siteItemId: string;
  action: WorkflowAction;
  fromStatus?: SiteItemStatus;
  toStatus?: SiteItemStatus;
  actorId: string;
  comment: string;
}

export class SiteItemsRepository {
  constructor(private readonly context: RepositoryContext) {}

  withContext(context: RepositoryContext): SiteItemsRepository {
    return new SiteItemsRepository(context);
  }

  async findDefaultProjectId(): Promise<string | undefined> {
    const project = await this.context.prisma.project.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" }
    });
    return project?.id;
  }

  async list(viewer: User, filters: SiteItemListFilters = {}): Promise<SiteItem[]> {
    const records = await this.context.prisma.siteItem.findMany({
      where: buildListWhere(viewer, filters),
      include: {
        _count: {
          select: {
            photos: {
              where: { deletedAt: null }
            }
          }
        }
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }]
    });

    return records.map(mapSiteItemRecord);
  }

  async findDetailById(viewer: User, itemId: string): Promise<SiteItemDetailData | undefined> {
    const record = await this.context.prisma.siteItem.findFirst({
      where: {
        AND: [siteItemVisibilityWhere(viewer), { id: itemId }]
      },
      include: {
        photos: {
          where: { deletedAt: null },
          orderBy: { uploadedAt: "desc" }
        },
        workflowLogs: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    return record
      ? {
          item: mapSiteItemRecord(record),
          photos: record.photos.map(mapPhotoAttachmentRecord),
          workflowLogs: record.workflowLogs.map(mapWorkflowLogRecord)
        }
      : undefined;
  }

  async findOrganizationById(organizationId: string): Promise<{ id: string; type: string; isActive: boolean } | undefined> {
    const organization = await this.context.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, type: true, isActive: true }
    });
    return organization ?? undefined;
  }

  async findUserById(userId: string): Promise<User | undefined> {
    const record = await this.context.prisma.user.findUnique({
      where: { id: userId },
      include: {
        sectionScopes: {
          select: { sectionId: true }
        }
      }
    });
    return record ? mapUserRecord(record) : undefined;
  }

  async existsActiveSection(sectionId: string): Promise<boolean> {
    return Boolean(await this.context.prisma.section.findFirst({ where: { id: sectionId, isActive: true }, select: { id: true } }));
  }

  async existsActiveArea(areaId: string): Promise<boolean> {
    return Boolean(await this.context.prisma.area.findFirst({ where: { id: areaId, isActive: true }, select: { id: true } }));
  }

  async existsActiveDiscipline(disciplineId: string): Promise<boolean> {
    return Boolean(await this.context.prisma.discipline.findFirst({ where: { id: disciplineId, isActive: true }, select: { id: true } }));
  }

  async nextItemNo(year = new Date().getFullYear()): Promise<string> {
    await this.acquireItemNoLock(year);
    const count = await this.context.prisma.siteItem.count();
    return `ITEM-${year}-${String(count + 1).padStart(4, "0")}`;
  }

  async acquireItemNoLock(year = new Date().getFullYear()): Promise<void> {
    const prisma = this.context.prisma;
    if (!("$executeRaw" in prisma)) return;
    await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`site-item-no:${year}`}))`;
  }

  async create(input: CreateSiteItemRecordInput): Promise<SiteItem> {
    const record = await this.context.prisma.siteItem.create({
      data: {
        ...input,
        responsibleOrgId: input.responsibleOrgId ?? null,
        responsibleUserId: input.responsibleUserId ?? null
      }
    });

    return mapSiteItemRecord(record);
  }

  async update(itemId: string, input: UpdateSiteItemRecordInput): Promise<SiteItem | undefined> {
    const exists = await this.context.prisma.siteItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!exists) return undefined;
    const record = await this.context.prisma.siteItem.update({
      where: { id: itemId },
      data: {
        ...input,
        updatedAt: new Date()
      }
    });

    return mapSiteItemRecord(record);
  }

  async updateWorkflow(itemId: string, input: UpdateSiteItemWorkflowInput): Promise<SiteItem | undefined> {
    const exists = await this.context.prisma.siteItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!exists) return undefined;
    const record = await this.context.prisma.siteItem.update({
      where: { id: itemId },
      data: {
        ...input,
        updatedAt: new Date()
      }
    });

    return mapSiteItemRecord(record);
  }

  async bindUnboundPhotos(viewer: User, item: SiteItem, photoIds: string[], stage: PhotoStage): Promise<PhotoAttachment[]> {
    if (photoIds.length === 0) return [];
    const snapshots = await this.snapshotsForItem(item);
    const bound: PhotoAttachment[] = [];
    for (const photoId of photoIds) {
      const photo = await this.context.prisma.photoAttachment.findUnique({
        where: { id: photoId }
      });
      if (!photo || photo.deletedAt || photo.uploadedBy !== viewer.id || photo.siteItemId) {
        throw badRequest("Photo cannot be bound");
      }
      const record = await this.context.prisma.photoAttachment.update({
        where: { id: photoId },
        data: {
          siteItemId: item.id,
          stage,
          ...snapshots
        }
      });
      bound.push(mapPhotoAttachmentRecord(record));
    }
    return bound;
  }

  async createWorkflowLog(input: WorkflowLogInput): Promise<WorkflowLog> {
    const record = await this.context.prisma.workflowLog.create({
      data: {
        siteItemId: input.siteItemId,
        action: input.action,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        actorId: input.actorId,
        comment: input.comment
      }
    });

    return mapWorkflowLogRecord(record);
  }

  async transaction<T>(callback: (context: RepositoryContext) => Promise<T>): Promise<T> {
    const prisma = this.context.prisma;
    if ("$transaction" in prisma) {
      return prisma.$transaction((transactionClient) => callback({ prisma: transactionClient }));
    }
    return callback(this.context);
  }

  private async snapshotsForItem(item: SiteItem): Promise<{
    sectionSnapshot?: string;
    areaSnapshot?: string;
    disciplineSnapshot?: string;
    responsibleOrgSnapshot?: string;
  }> {
    const [section, area, discipline, responsibleOrg] = await Promise.all([
      this.context.prisma.section.findUnique({ where: { id: item.sectionId }, select: { name: true } }),
      this.context.prisma.area.findUnique({ where: { id: item.areaId }, select: { name: true } }),
      this.context.prisma.discipline.findUnique({ where: { id: item.disciplineId }, select: { name: true } }),
      item.responsibleOrgId
        ? this.context.prisma.organization.findUnique({ where: { id: item.responsibleOrgId }, select: { name: true } })
        : Promise.resolve(null)
    ]);

    return {
      sectionSnapshot: section?.name,
      areaSnapshot: area?.name,
      disciplineSnapshot: discipline?.name,
      responsibleOrgSnapshot: responsibleOrg?.name
    };
  }
}

function buildListWhere(viewer: User, filters: SiteItemListFilters): Prisma.SiteItemWhereInput {
  const now = new Date();
  return {
    AND: [
      siteItemVisibilityWhere(viewer),
      {
        status: filters.status,
        type: filters.type,
        severity: filters.severity,
        sectionId: filters.sectionId,
        areaId: filters.areaId,
        disciplineId: filters.disciplineId,
        responsibleOrgId: filters.organizationId,
        dueAt: filters.overdue ? { lt: now } : undefined,
        NOT: filters.overdue ? { status: { in: ["closed", "voided"] } } : undefined,
        OR: filters.search
          ? [
              { itemNo: { contains: filters.search, mode: "insensitive" } },
              { title: { contains: filters.search, mode: "insensitive" } },
              { description: { contains: filters.search, mode: "insensitive" } }
            ]
          : undefined
      }
    ]
  };
}
