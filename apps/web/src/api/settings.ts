import type { ApiClient } from "./client";

export interface SystemSettings {
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

export class SettingsApi {
  constructor(private readonly client: ApiClient) {}

  get(): Promise<SystemSettings> {
    return this.client.get<SystemSettings>("/settings");
  }

  update(input: SystemSettingsUpdateInput): Promise<SystemSettings> {
    return this.client.patch<SystemSettings>("/settings", input);
  }
}
