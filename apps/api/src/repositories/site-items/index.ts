import type { Prisma } from "@prisma/client";
import {
  mapPhotoAttachmentRecord,
  mapSiteItemRecord,
  mapWorkflowLogRecord
} from "../../mappers/prismaRecords.js";
import type { PhotoAttachment, Severity, SiteItem, SiteItemStatus, SiteItemType, User, WorkflowLog } from "../../types.js";
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

export class SiteItemsRepository {
  constructor(private readonly context: RepositoryContext) {}

  async list(viewer: User, filters: SiteItemListFilters = {}): Promise<SiteItem[]> {
    const records = await this.context.prisma.siteItem.findMany({
      where: buildListWhere(viewer, filters),
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
