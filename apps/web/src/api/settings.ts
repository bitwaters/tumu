import type { ApiClient } from "./client.js";

export interface SystemSettings {
  objectStorage: {
    endpoint: string;
    bucket: string;
    activeProfileId: string;
    profiles: ObjectStorageProfile[];
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

export interface ObjectStorageProfile {
  id: string;
  name: string;
  endpoint: string;
  bucket: string;
  capacityBytes?: number;
  accessKeyConfigured: boolean;
  secretKeyConfigured: boolean;
  isActive: boolean;
  usage: {
    status: "ok" | "error";
    objectCount?: number;
    usedBytes?: number;
    capacityBytes?: number;
    remainingBytes?: number;
    checkedAt: string;
    message?: string;
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
      capacityBytes?: number;
    }>;
  };
  uploads?: {
    maxBytes?: number;
  };
  features?: {
    backupsManagedExternally?: boolean;
  };
}

export class SettingsApi {
  constructor(private readonly client: ApiClient) {}

  get(): Promise<SystemSettings> {
    return this.client.get<SystemSettings>("/settings");
  }

  update(input: SystemSettingsUpdateInput): Promise<SystemSettings> {
    return this.client.patch<SystemSettings>("/settings", input);
  }
}
