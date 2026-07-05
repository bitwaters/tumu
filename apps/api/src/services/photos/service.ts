import type { ApiConfig } from "../../config.js";
import { badRequest, forbidden, notFound } from "../../errors.js";
import { AuditRepository } from "../../repositories/audit/index.js";
import { PhotosRepository } from "../../repositories/photos/index.js";
import type { IdempotencyRequest } from "../idempotency/index.js";
import { IdempotencyService } from "../idempotency/index.js";
import type { PresignResult } from "../../storage.js";
import { ObjectStorageClient } from "../../storage.js";
import type { PhotoAttachment, User } from "../../types.js";
import type { PhotoListFilters } from "../../repositories/photos/index.js";
import type { SystemSettingsService } from "../system-settings/index.js";

export interface PhotoPresignInput {
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface PhotoCompleteInput {
  objectKey?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export class PhotosService {
  constructor(
    private readonly repository: PhotosRepository,
    private readonly storage: ObjectStorageClient,
    private readonly config: ApiConfig,
    private readonly idempotencyService: IdempotencyService,
    private readonly auditRepository: AuditRepository,
    private readonly settingsService?: SystemSettingsService
  ) {}

  async list(viewer: User, filters: PhotoListFilters = {}): Promise<PhotoAttachment[]> {
    return this.repository.list(viewer, filters);
  }

  async presign(viewer: User, input: PhotoPresignInput): Promise<PresignResult> {
    const fileName = input.fileName ?? "";
    const mimeType = input.mimeType ?? "";
    const sizeBytes = Number(input.sizeBytes ?? 0);
    validateUpload(mimeType, sizeBytes, await this.uploadMaxBytes());
    return this.storage.createUploadTarget({
      actorId: viewer.id,
      fileName,
      mimeType,
      sizeBytes
    });
  }

  async completeUpload(viewer: User, input: PhotoCompleteInput, idempotency?: Pick<IdempotencyRequest, "key" | "method" | "path">): Promise<PhotoAttachment> {
    validateCompletedObject(viewer, input);
    validateUpload(input.mimeType ?? "image/jpeg", Number(input.sizeBytes ?? 0), await this.uploadMaxBytes());
    return this.repository.transaction(async (context) => {
      const repository = new PhotosRepository(context);
      const idempotencyService = this.idempotencyService.withContext(context);
      return idempotencyService.run(
        {
          actorId: viewer.id,
          method: idempotency?.method ?? "POST",
          path: idempotency?.path ?? "/photos/complete",
          key: idempotency?.key,
          requestBody: input
        },
        async () => {
          const objectKey = input.objectKey!;
          const fileName = input.fileName ?? objectKey.split("/").at(-1) ?? "photo.jpg";
          const photo = await repository.createUnbound({
            objectKey,
            thumbnailKey: objectKey,
            fileName,
            mimeType: input.mimeType ?? "image/jpeg",
            sizeBytes: Number(input.sizeBytes ?? 0),
            uploadedBy: viewer.id
          });
          return { body: photo };
        }
      );
    });
  }

  async previewObjectKey(viewer: User, photoId: string): Promise<string> {
    const photo = await this.repository.findPreviewableById(viewer, photoId);
    if (!photo) throw notFound("Photo not found");
    return photo.objectKey;
  }

  async preview(viewer: User, photoId: string): Promise<{ previewUrl: string; expiresInSeconds: number }> {
    return {
      previewUrl: await this.storage.readObjectDataUrl(await this.previewObjectKey(viewer, photoId)),
      expiresInSeconds: 900
    };
  }

  async delete(viewer: User, photoId: string, idempotency?: Pick<IdempotencyRequest, "key" | "method" | "path">): Promise<PhotoAttachment> {
    return this.repository.transaction(async (context) => {
      const repository = new PhotosRepository(context);
      const auditRepository = this.auditRepository.withContext(context);
      const idempotencyService = this.idempotencyService.withContext(context);
      return idempotencyService.run(
        {
          actorId: viewer.id,
          method: idempotency?.method ?? "DELETE",
          path: idempotency?.path ?? `/photos/${photoId}`,
          key: idempotency?.key,
          requestBody: null
        },
        async () => {
          const existing = await repository.findById(photoId);
          if (!existing || existing.deletedAt) throw notFound("Photo not found");
          if (viewer.role !== "admin" && existing.uploadedBy !== viewer.id) throw forbidden();
          const deleted = await repository.markDeleted(photoId);
          if (!deleted) throw notFound("Photo not found");
          await auditRepository.create({
            actorId: viewer.id,
            action: "delete",
            resourceType: "PhotoAttachment",
            resourceId: photoId
          });
          return { body: deleted };
        }
      );
    });
  }

  private uploadMaxBytes(): Promise<number> {
    return this.settingsService?.uploadMaxBytes() ?? Promise.resolve(this.config.uploadMaxBytes);
  }
}

function validateUpload(mimeType: string, sizeBytes: number, maxBytes: number): void {
  if (!mimeType.startsWith("image/")) throw badRequest("Unsupported MIME type");
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) throw badRequest("sizeBytes is invalid");
  if (sizeBytes > maxBytes) throw badRequest("File is too large");
}

function validateCompletedObject(viewer: User, input: PhotoCompleteInput): void {
  const objectKey = input.objectKey ?? "";
  if (!objectKey.startsWith(`uploads/${viewer.id}/`)) throw badRequest("objectKey does not belong to current user");
}
