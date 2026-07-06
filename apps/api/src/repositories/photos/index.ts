import type { Prisma } from "@prisma/client";
import { mapPhotoAttachmentRecord } from "../../mappers/prismaRecords.js";
import type { PhotoAttachment, User } from "../../types.js";
import type { RepositoryContext } from "../context.js";
import { siteItemVisibilityWhere } from "../visibility.js";

export interface PhotoListFilters {
  unboundOnly?: boolean;
  search?: string;
}

export interface CreateUnboundPhotoInput {
  objectKey: string;
  thumbnailKey: string;
  storageProfileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
}

export class PhotosRepository {
  constructor(private readonly context: RepositoryContext) {}

  async list(viewer: User, filters: PhotoListFilters = {}): Promise<PhotoAttachment[]> {
    const records = await this.context.prisma.photoAttachment.findMany({
      where: buildPhotoVisibilityWhere(viewer, filters),
      orderBy: { uploadedAt: "desc" }
    });

    return records.map(mapPhotoAttachmentRecord);
  }

  async findPreviewableById(viewer: User, photoId: string): Promise<PhotoAttachment | undefined> {
    const record = await this.context.prisma.photoAttachment.findFirst({
      where: {
        AND: [buildPhotoVisibilityWhere(viewer), { id: photoId }]
      }
    });

    return record ? mapPhotoAttachmentRecord(record) : undefined;
  }

  async findById(photoId: string): Promise<PhotoAttachment | undefined> {
    const record = await this.context.prisma.photoAttachment.findUnique({
      where: { id: photoId }
    });

    return record ? mapPhotoAttachmentRecord(record) : undefined;
  }

  async createUnbound(input: CreateUnboundPhotoInput): Promise<PhotoAttachment> {
    const record = await this.context.prisma.photoAttachment.create({
      data: input
    });

    return mapPhotoAttachmentRecord(record);
  }

  async markDeleted(photoId: string, deletedAt = new Date()): Promise<PhotoAttachment | undefined> {
    const exists = await this.context.prisma.photoAttachment.findUnique({
      where: { id: photoId },
      select: { id: true }
    });
    if (!exists) return undefined;

    const record = await this.context.prisma.photoAttachment.update({
      where: { id: photoId },
      data: { deletedAt }
    });

    return mapPhotoAttachmentRecord(record);
  }

  async transaction<T>(callback: (context: RepositoryContext) => Promise<T>): Promise<T> {
    const prisma = this.context.prisma;
    if ("$transaction" in prisma) {
      return prisma.$transaction((transactionClient) => callback({ prisma: transactionClient }));
    }
    return callback(this.context);
  }
}

function buildPhotoVisibilityWhere(viewer: User, filters: PhotoListFilters = {}): Prisma.PhotoAttachmentWhereInput {
  return {
    deletedAt: null,
    siteItemId: filters.unboundOnly ? null : undefined,
    fileName: filters.search ? { contains: filters.search, mode: "insensitive" } : undefined,
    OR:
      viewer.role === "admin"
        ? undefined
        : [
            { uploadedBy: viewer.id },
            {
              siteItem: siteItemVisibilityWhere(viewer)
            }
          ]
  };
}
