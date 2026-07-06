import { equal, rejects } from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../config.js";
import { AuditRepository } from "../repositories/audit/index.js";
import { IdempotencyRepository } from "../repositories/idempotency/index.js";
import { PhotosRepository } from "../repositories/photos/index.js";
import { IdempotencyService } from "../services/idempotency/index.js";
import { PhotosService } from "../services/photos/index.js";
import { ObjectStorageClient } from "../storage.js";
import type { PhotoAttachment, User } from "../types.js";

const viewer: User = {
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

test("object storage links use runtime endpoint and bucket settings", async () => {
  const storage = new ObjectStorageClient(loadConfig(), async () => ({
    id: "runtime",
    endpoint: "http://runtime-minio:9000",
    bucket: "runtime-bucket",
    accessKey: "runtime-access-key",
    secretKey: "runtime-secret-key"
  }));

  const preview = await storage.createPreviewTarget("drawings/cover 1.png");
  const download = await storage.createDownloadTarget("exports/report.xlsx");

  equal(preview.previewUrl, "http://runtime-minio:9000/runtime-bucket/drawings/cover%201.png?preview=1");
  equal(download.downloadUrl, "http://runtime-minio:9000/runtime-bucket/exports/report.xlsx?download=1");
});

test("photo complete upload replays idempotent response without duplicate records", async () => {
  const state = createPhotoPrismaState();
  const service = createPhotosService(state);
  const input = {
    objectKey: "uploads/u-supervisor/IMG_001.jpg",
    fileName: "IMG_001.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024
  };

  const first = await service.completeUpload(viewer, input, { method: "POST", path: "/photos/complete", key: "photo-key-1" });
  const second = await service.completeUpload(viewer, input, { method: "POST", path: "/photos/complete", key: "photo-key-1" });

  equal(first.id, second.id);
  equal(state.photos.length, 1);
  equal(state.idempotencyRecords.length, 1);
});

test("photo upload stores the selected object storage profile", async () => {
  const state = createPhotoPrismaState();
  const config = loadConfig();
  const prisma = createPhotoPrismaStub(state);
  const service = new PhotosService(
    new PhotosRepository({ prisma }),
    new ObjectStorageClient(config),
    config,
    new IdempotencyService(new IdempotencyRepository({ prisma }), config),
    new AuditRepository({ prisma }),
    {
      uploadMaxBytes: async () => config.uploadMaxBytes,
      objectStorageConfigById: async (profileId?: string) => ({
        id: profileId ?? "primary",
        endpoint: "http://runtime-minio:9000",
        bucket: "runtime-bucket",
        accessKey: "runtime-access-key",
        secretKey: "runtime-secret-key"
      }),
      objectStorageConfig: async () => ({
        id: "primary",
        endpoint: "http://runtime-minio:9000",
        bucket: "runtime-bucket",
        accessKey: "runtime-access-key",
        secretKey: "runtime-secret-key"
      })
    } as never
  );

  const presign = await service.presign(viewer, { fileName: "IMG_001.jpg", mimeType: "image/jpeg", sizeBytes: 1024 });
  equal(presign.storageProfileId, "primary");

  const photo = await service.completeUpload(viewer, {
    objectKey: presign.objectKey,
    storageProfileId: "archive",
    fileName: "IMG_001.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024
  });

  equal(photo.storageProfileId, "archive");
  equal(state.photos[0]?.storageProfileId, "archive");
});

test("photo complete upload rejects mismatched idempotent retries without applying mutations", async () => {
  const state = createPhotoPrismaState();
  const service = createPhotosService(state);
  const firstInput = {
    objectKey: "uploads/u-supervisor/IMG_001.jpg",
    fileName: "IMG_001.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024
  };

  await service.completeUpload(viewer, firstInput, { method: "POST", path: "/photos/complete", key: "photo-key-conflict" });

  await rejects(
    () =>
      service.completeUpload(
        viewer,
        {
          ...firstInput,
          objectKey: "uploads/u-supervisor/IMG_002.jpg",
          fileName: "IMG_002.jpg"
        },
        { method: "POST", path: "/photos/complete", key: "photo-key-conflict" }
      ),
    { status: 409 }
  );
  equal(state.photos.length, 1);
  equal(state.auditLogs.length, 0);
  equal(state.idempotencyRecords.length, 1);
});

test("photo complete upload reuses expired idempotency keys as new requests", async () => {
  const state = createPhotoPrismaState();
  state.idempotencyRecords.push({
    id: "idem-expired",
    actorId: viewer.id,
    method: "POST",
    path: "/photos/complete",
    key: "expired-photo-key",
    requestHash: "expired-hash",
    responseStatus: 200,
    responseBody: { id: "old-photo" },
    createdAt: new Date("2026-06-25T08:00:00.000Z"),
    expiresAt: new Date("2000-01-01T00:00:00.000Z")
  });
  const service = createPhotosService(state);

  const result = await service.completeUpload(
    viewer,
    {
      objectKey: "uploads/u-supervisor/IMG_AFTER_TTL.jpg",
      fileName: "IMG_AFTER_TTL.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024
    },
    { method: "POST", path: "/photos/complete", key: "expired-photo-key" }
  );

  equal(result.fileName, "IMG_AFTER_TTL.jpg");
  equal(state.photos.length, 1);
  equal(state.idempotencyRecords.length, 1);
  equal(state.idempotencyRecords[0]?.responseBody, result);
});

test("photo delete soft-deletes, audits, and replays idempotent response", async () => {
  const state = createPhotoPrismaState([
    createPhotoRecord({
      id: "photo-1",
      objectKey: "uploads/u-supervisor/IMG_001.jpg",
      uploadedBy: viewer.id
    })
  ]);
  const service = createPhotosService(state);

  const first = await service.delete(viewer, "photo-1", { method: "DELETE", path: "/photos/photo-1", key: "delete-photo-1" });
  const second = await service.delete(viewer, "photo-1", { method: "DELETE", path: "/photos/photo-1", key: "delete-photo-1" });

  equal(first.id, second.id);
  equal(Boolean(state.photos[0]?.deletedAt), true);
  equal(state.auditLogs.length, 1);
  equal(state.idempotencyRecords.length, 1);
});

test("photo complete rejects object keys owned by another user", async () => {
  const service = createPhotosService(createPhotoPrismaState());

  await rejects(() =>
    service.completeUpload(
      viewer,
      {
        objectKey: "uploads/u-other/IMG_001.jpg",
        fileName: "IMG_001.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024
      },
      { method: "POST", path: "/photos/complete", key: "photo-key-2" }
    )
  );
});

interface PhotoPrismaState {
  photos: PhotoRecordStub[];
  idempotencyRecords: IdempotencyRecordStub[];
  auditLogs: AuditLogRecordStub[];
}

interface PhotoRecordStub {
  id: string;
  siteItemId: string | null;
  stage: PhotoAttachment["stage"] | null;
  objectKey: string;
  thumbnailKey: string;
  storageProfileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: Date;
  deletedAt: Date | null;
  sectionSnapshot: string | null;
  areaSnapshot: string | null;
  disciplineSnapshot: string | null;
  responsibleOrgSnapshot: string | null;
}

interface IdempotencyRecordStub {
  id: string;
  actorId: string;
  method: string;
  path: string;
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
  expiresAt: Date;
}

interface AuditLogRecordStub {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: unknown;
  createdAt: Date;
}

function createPhotosService(state: PhotoPrismaState): PhotosService {
  const prisma = createPhotoPrismaStub(state);
  const config = loadConfig();
  return new PhotosService(
    new PhotosRepository({ prisma }),
    new ObjectStorageClient(config),
    config,
    new IdempotencyService(new IdempotencyRepository({ prisma }), config),
    new AuditRepository({ prisma })
  );
}

function createPhotoPrismaState(photos: PhotoRecordStub[] = []): PhotoPrismaState {
  return {
    photos,
    idempotencyRecords: [],
    auditLogs: []
  };
}

function createPhotoPrismaStub(state: PhotoPrismaState) {
  const transactionClient = {
    photoAttachment: {
      create: async ({ data }: { data: CreatePhotoDataStub }) => {
        const record = createPhotoRecord({
          id: `photo-${state.photos.length + 1}`,
          ...data
        });
        state.photos.unshift(record);
        return record;
      },
      findUnique: async ({ where }: { where: { id: string } }) => state.photos.find((photo) => photo.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { deletedAt: Date } }) => {
        const record = state.photos.find((photo) => photo.id === where.id);
        if (!record) throw new Error("Photo not found");
        record.deletedAt = data.deletedAt;
        return record;
      }
    },
    idempotencyRecord: {
      findUnique: async ({ where }: { where: { actorId_method_path_key: IdempotencyLookupStub } }) =>
        state.idempotencyRecords.find(
          (record) =>
            record.actorId === where.actorId_method_path_key.actorId &&
            record.method === where.actorId_method_path_key.method &&
            record.path === where.actorId_method_path_key.path &&
            record.key === where.actorId_method_path_key.key
        ) ?? null,
      create: async ({ data }: { data: CreateIdempotencyDataStub }) => {
        const record = {
          id: `idem-${state.idempotencyRecords.length + 1}`,
          ...data,
          createdAt: new Date("2026-06-25T08:31:00.000Z")
        };
        state.idempotencyRecords.push(record);
        return record;
      },
      delete: async ({ where }: { where: { actorId_method_path_key: IdempotencyLookupStub } }) => {
        state.idempotencyRecords = state.idempotencyRecords.filter(
          (record) =>
            record.actorId !== where.actorId_method_path_key.actorId ||
            record.method !== where.actorId_method_path_key.method ||
            record.path !== where.actorId_method_path_key.path ||
            record.key !== where.actorId_method_path_key.key
        );
      }
    },
    auditLog: {
      create: async ({ data }: { data: Omit<AuditLogRecordStub, "id" | "createdAt"> }) => {
        const record = {
          id: `audit-${state.auditLogs.length + 1}`,
          ...data,
          createdAt: new Date("2026-06-25T08:32:00.000Z")
        };
        state.auditLogs.push(record);
        return record;
      }
    }
  };

  return {
    ...transactionClient,
    $transaction: async <T>(callback: (client: typeof transactionClient) => Promise<T>) => {
      const snapshot = clonePhotoPrismaState(state);
      try {
        return await callback(transactionClient);
      } catch (error) {
        state.photos = snapshot.photos;
        state.idempotencyRecords = snapshot.idempotencyRecords;
        state.auditLogs = snapshot.auditLogs;
        throw error;
      }
    }
  } as never;
}

interface CreatePhotoDataStub {
  objectKey: string;
  thumbnailKey: string;
  storageProfileId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
}

interface IdempotencyLookupStub {
  actorId: string;
  method: string;
  path: string;
  key: string;
}

interface CreateIdempotencyDataStub extends IdempotencyLookupStub {
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  expiresAt: Date;
}

function createPhotoRecord(input: Partial<CreatePhotoDataStub> & { id: string; objectKey: string; uploadedBy: string }): PhotoRecordStub {
  return {
    id: input.id,
    siteItemId: null,
    stage: null,
    objectKey: input.objectKey,
    thumbnailKey: input.thumbnailKey ?? input.objectKey,
    storageProfileId: input.storageProfileId ?? "default",
    fileName: input.fileName ?? input.objectKey.split("/").at(-1) ?? "photo.jpg",
    mimeType: input.mimeType ?? "image/jpeg",
    sizeBytes: input.sizeBytes ?? 1024,
    uploadedBy: input.uploadedBy,
    uploadedAt: new Date("2026-06-25T08:30:00.000Z"),
    deletedAt: null,
    sectionSnapshot: null,
    areaSnapshot: null,
    disciplineSnapshot: null,
    responsibleOrgSnapshot: null
  };
}

function clonePhotoPrismaState(state: PhotoPrismaState): PhotoPrismaState {
  return {
    photos: state.photos.map((photo) => ({
      ...photo,
      uploadedAt: new Date(photo.uploadedAt),
      deletedAt: photo.deletedAt ? new Date(photo.deletedAt) : null
    })),
    idempotencyRecords: state.idempotencyRecords.map((record) => ({
      ...record,
      createdAt: new Date(record.createdAt),
      expiresAt: new Date(record.expiresAt)
    })),
    auditLogs: state.auditLogs.map((record) => ({
      ...record,
      createdAt: new Date(record.createdAt)
    }))
  };
}
