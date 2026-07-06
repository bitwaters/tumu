import type { ApiConfig } from "../../config.js";
import { badRequest, forbidden } from "../../errors.js";
import type { AuditRepository } from "../../repositories/audit/index.js";
import type { SystemSettingsRepository } from "../../repositories/system-settings/index.js";
import { ObjectStorageClient, type ObjectStorageUsageResult } from "../../storage.js";
import type { User } from "../../types.js";

export interface ObjectStorageRuntimeConfig {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

export interface ObjectStorageProfileView {
  id: string;
  name: string;
  endpoint: string;
  bucket: string;
  accessKeyConfigured: boolean;
  secretKeyConfigured: boolean;
  isActive: boolean;
  usage: ObjectStorageUsageResult;
}

interface ObjectStorageProfileRecord {
  id: string;
  name: string;
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

export interface SystemSettingsView {
  objectStorage: {
    endpoint: string;
    bucket: string;
    activeProfileId: string;
    profiles: ObjectStorageProfileView[];
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
    activeProfileId?: string;
    profiles?: Array<{
      id?: string;
      name?: string;
      endpoint?: string;
      bucket?: string;
      accessKey?: string;
      secretKey?: string;
    }>;
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
  activeProfileId: "objectStorage.activeProfileId",
  profiles: "objectStorage.profiles",
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
      const map = await this.repository.map();
      if (storage.profiles !== undefined) {
        const existing = this.storedProfiles(map);
        const profiles = validateProfiles(storage.profiles, existing);
        if (profiles.length === 0) throw badRequest("objectStorage.profiles must include at least one profile");
        values[keys.profiles] = JSON.stringify(profiles);
        values[keys.activeProfileId] = validateActiveProfileId(storage.activeProfileId ?? map[keys.activeProfileId] ?? profiles[0].id, profiles);
      } else if (storage.endpoint !== undefined || storage.bucket !== undefined || storage.accessKey !== undefined || storage.secretKey !== undefined) {
        const profiles = this.storedProfiles(map);
        const activeProfileId = map[keys.activeProfileId] || profiles[0].id;
        const nextProfiles = profiles.map((profile) =>
          profile.id === activeProfileId
            ? {
                ...profile,
                endpoint: storage.endpoint !== undefined ? validateUrl(storage.endpoint, "objectStorage.endpoint") : profile.endpoint,
                bucket: storage.bucket !== undefined ? validateRequired(storage.bucket, "objectStorage.bucket") : profile.bucket,
                accessKey: storage.accessKey !== undefined && storage.accessKey.trim() ? storage.accessKey.trim() : profile.accessKey,
                secretKey: storage.secretKey !== undefined && storage.secretKey.trim() ? storage.secretKey.trim() : profile.secretKey
              }
            : profile
        );
        values[keys.profiles] = JSON.stringify(nextProfiles);
        values[keys.activeProfileId] = activeProfileId;
      }
      if (storage.activeProfileId !== undefined && storage.profiles === undefined) {
        values[keys.activeProfileId] = validateActiveProfileId(storage.activeProfileId, this.storedProfiles(await this.repository.map()));
      }
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
        metadata: { keys: Object.keys(values).filter((key) => !key.includes("secretKey") && key !== keys.profiles) }
      });
    }
    return this.view(viewer);
  }

  async objectStorageConfig(): Promise<ObjectStorageRuntimeConfig> {
    const map = await this.repository.map();
    return this.activeProfile(map);
  }

  async uploadMaxBytes(): Promise<number> {
    const map = await this.repository.map();
    const configured = Number(map[keys.uploadMaxBytes]);
    return Number.isFinite(configured) && configured > 0 ? configured : this.config.uploadMaxBytes;
  }

  private async toView(map: Record<string, string>, viewer: User): Promise<SystemSettingsView> {
    const isAdmin = viewer.role === "admin";
    const profiles = isAdmin ? this.storedProfiles(map) : [];
    const activeProfile = isAdmin ? this.activeProfile(map) : undefined;
    const usageClient = new ObjectStorageClient(this.config);
    const profileViews = await Promise.all(
      profiles.map(async (profile) => ({
        id: profile.id,
        name: profile.name,
        endpoint: profile.endpoint,
        bucket: profile.bucket,
        accessKeyConfigured: Boolean(profile.accessKey),
        secretKeyConfigured: Boolean(profile.secretKey),
        isActive: profile.id === activeProfile?.id,
        usage: await usageClient.inspectUsage(profile)
      }))
    );
    return {
      objectStorage: {
        endpoint: activeProfile?.endpoint ?? "",
        bucket: activeProfile?.bucket ?? "",
        activeProfileId: activeProfile?.id ?? "",
        profiles: profileViews,
        accessKeyConfigured: Boolean(activeProfile?.accessKey),
        secretKeyConfigured: Boolean(activeProfile?.secretKey)
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

  private storedProfiles(map: Record<string, string>): ObjectStorageProfileRecord[] {
    const parsed = parseProfiles(map[keys.profiles]);
    if (parsed.length) return parsed;
    return [
      {
        id: "default",
        name: "默认存储",
        endpoint: map[keys.endpoint] || this.config.objectStorageEndpoint,
        bucket: map[keys.bucket] || this.config.objectStorageBucket,
        accessKey: map[keys.accessKey] || this.config.objectStorageAccessKey,
        secretKey: map[keys.secretKey] || this.config.objectStorageSecretKey
      }
    ];
  }

  private activeProfile(map: Record<string, string>): ObjectStorageProfileRecord {
    const profiles = this.storedProfiles(map);
    return profiles.find((profile) => profile.id === map[keys.activeProfileId]) ?? profiles[0];
  }
}

function parseProfiles(value?: string): ObjectStorageProfileRecord[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isProfileRecord)
      .map((profile) => ({
        id: profile.id,
        name: profile.name,
        endpoint: profile.endpoint,
        bucket: profile.bucket,
        accessKey: profile.accessKey,
        secretKey: profile.secretKey
      }));
  } catch {
    return [];
  }
}

function isProfileRecord(value: unknown): value is ObjectStorageProfileRecord {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<ObjectStorageProfileRecord>;
  return ["id", "name", "endpoint", "bucket", "accessKey", "secretKey"].every((key) => typeof profile[key as keyof ObjectStorageProfileRecord] === "string");
}

function validateProfiles(input: NonNullable<SystemSettingsUpdateInput["objectStorage"]>["profiles"], existing: ObjectStorageProfileRecord[]): ObjectStorageProfileRecord[] {
  const existingById = new Map(existing.map((profile) => [profile.id, profile]));
  const usedIds = new Set<string>();
  return (input ?? []).map((profile, index) => {
    const id = sanitizeProfileId(profile.id || `storage-${index + 1}`);
    if (usedIds.has(id)) throw badRequest("objectStorage.profile id must be unique");
    usedIds.add(id);
    const previous = existingById.get(id);
    return {
      id,
      name: validateRequired(profile.name ?? previous?.name ?? `存储 ${index + 1}`, "objectStorage.profile.name"),
      endpoint: validateUrl(profile.endpoint ?? previous?.endpoint ?? "", "objectStorage.profile.endpoint"),
      bucket: validateRequired(profile.bucket ?? previous?.bucket ?? "", "objectStorage.profile.bucket"),
      accessKey: profile.accessKey?.trim() || previous?.accessKey || "",
      secretKey: profile.secretKey?.trim() || previous?.secretKey || ""
    };
  });
}

function validateActiveProfileId(id: string, profiles: ObjectStorageProfileRecord[]): string {
  const trimmed = sanitizeProfileId(id);
  if (!profiles.some((profile) => profile.id === trimmed)) throw badRequest("objectStorage.activeProfileId must match a profile");
  return trimmed;
}

function sanitizeProfileId(value: string): string {
  const trimmed = value.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
  if (!trimmed) throw badRequest("objectStorage.profile.id is required");
  return trimmed;
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
