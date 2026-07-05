import type { ApiConfig } from "../../config.js";
import { badRequest, forbidden } from "../../errors.js";
import type { AuditRepository } from "../../repositories/audit/index.js";
import type { SystemSettingsRepository } from "../../repositories/system-settings/index.js";
import type { User } from "../../types.js";

export interface ObjectStorageRuntimeConfig {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

export interface SystemSettingsView {
  objectStorage: {
    endpoint: string;
    bucket: string;
    accessKeyConfigured: boolean;
    secretKeyConfigured: boolean;
  };
  uploads: {
    maxBytes: number;
  };
  features: {
    objectStorageEditable: boolean;
    backupsManagedExternally: boolean;
  };
}

export interface SystemSettingsUpdateInput {
  objectStorage?: {
    endpoint?: string;
    bucket?: string;
    accessKey?: string;
    secretKey?: string;
  };
  uploads?: {
    maxBytes?: number;
  };
  features?: {
    backupsManagedExternally?: boolean;
  };
}

const keys = {
  endpoint: "objectStorage.endpoint",
  bucket: "objectStorage.bucket",
  accessKey: "objectStorage.accessKey",
  secretKey: "objectStorage.secretKey",
  uploadMaxBytes: "uploads.maxBytes",
  backupsManagedExternally: "features.backupsManagedExternally"
} as const;

export class SystemSettingsService {
  constructor(
    private readonly repository: SystemSettingsRepository,
    private readonly config: ApiConfig,
    private readonly auditRepository: AuditRepository
  ) {}

  async view(viewer: User): Promise<SystemSettingsView> {
    const map = viewer.role === "admin" ? await this.repository.map() : {};
    return this.toView(map, viewer);
  }

  async update(viewer: User, input: SystemSettingsUpdateInput): Promise<SystemSettingsView> {
    if (viewer.role !== "admin") throw forbidden();
    const values: Record<string, string> = {};
    const storage = input.objectStorage;
    if (storage) {
      if (storage.endpoint !== undefined) values[keys.endpoint] = validateUrl(storage.endpoint, "objectStorage.endpoint");
      if (storage.bucket !== undefined) values[keys.bucket] = validateRequired(storage.bucket, "objectStorage.bucket");
      if (storage.accessKey !== undefined && storage.accessKey.trim()) values[keys.accessKey] = storage.accessKey.trim();
      if (storage.secretKey !== undefined && storage.secretKey.trim()) values[keys.secretKey] = storage.secretKey.trim();
    }
    if (input.uploads?.maxBytes !== undefined) {
      const maxBytes = Number(input.uploads.maxBytes);
      if (!Number.isFinite(maxBytes) || maxBytes < 1024 * 1024) throw badRequest("uploads.maxBytes must be at least 1MB");
      values[keys.uploadMaxBytes] = String(Math.round(maxBytes));
    }
    if (input.features?.backupsManagedExternally !== undefined) {
      values[keys.backupsManagedExternally] = String(Boolean(input.features.backupsManagedExternally));
    }
    if (Object.keys(values).length) {
      await this.repository.upsertMany(values, viewer.id);
      await this.auditRepository.create({
        actorId: viewer.id,
        action: "update_system_settings",
        resourceType: "SystemSetting",
        resourceId: "global",
        metadata: { keys: Object.keys(values).filter((key) => key !== keys.secretKey) }
      });
    }
    return this.view(viewer);
  }

  async objectStorageConfig(): Promise<ObjectStorageRuntimeConfig> {
    const map = await this.repository.map();
    return {
      endpoint: map[keys.endpoint] || this.config.objectStorageEndpoint,
      bucket: map[keys.bucket] || this.config.objectStorageBucket,
      accessKey: map[keys.accessKey] || this.config.objectStorageAccessKey,
      secretKey: map[keys.secretKey] || this.config.objectStorageSecretKey
    };
  }

  async uploadMaxBytes(): Promise<number> {
    const map = await this.repository.map();
    const configured = Number(map[keys.uploadMaxBytes]);
    return Number.isFinite(configured) && configured > 0 ? configured : this.config.uploadMaxBytes;
  }

  private toView(map: Record<string, string>, viewer: User): SystemSettingsView {
    const isAdmin = viewer.role === "admin";
    return {
      objectStorage: {
        endpoint: isAdmin ? map[keys.endpoint] || this.config.objectStorageEndpoint : "",
        bucket: isAdmin ? map[keys.bucket] || this.config.objectStorageBucket : "",
        accessKeyConfigured: Boolean(map[keys.accessKey] || this.config.objectStorageAccessKey),
        secretKeyConfigured: Boolean(map[keys.secretKey] || this.config.objectStorageSecretKey)
      },
      uploads: {
        maxBytes: isAdmin ? Number(map[keys.uploadMaxBytes] || this.config.uploadMaxBytes) : 0
      },
      features: {
        objectStorageEditable: isAdmin,
        backupsManagedExternally: map[keys.backupsManagedExternally] === "true"
      }
    };
  }
}

function validateRequired(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw badRequest(`${field} is required`);
  return trimmed;
}

function validateUrl(value: string, field: string): string {
  const trimmed = validateRequired(value, field).replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid protocol");
    return trimmed;
  } catch {
    throw badRequest(`${field} must be a valid http(s) URL`);
  }
}
