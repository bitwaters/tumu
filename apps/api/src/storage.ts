import { randomUUID } from "node:crypto";
import type { ApiConfig } from "./config.js";

export interface PresignInput {
  actorId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PresignResult {
  objectKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

export class ObjectStorageClient {
  constructor(private readonly config: ApiConfig) {}

  createObjectKey(input: PresignInput): string {
    const extension = input.fileName.includes(".") ? input.fileName.split(".").at(-1) : "bin";
    return `uploads/${input.actorId}/${Date.now()}-${randomUUID()}.${extension}`;
  }

  createUploadTarget(input: PresignInput): PresignResult {
    const objectKey = this.createObjectKey(input);
    return {
      objectKey,
      uploadUrl: this.objectUrl(objectKey, "upload=1"),
      expiresInSeconds: 900
    };
  }

  createPreviewTarget(objectKey: string): { previewUrl: string; expiresInSeconds: number } {
    return {
      previewUrl: this.objectUrl(objectKey, "preview=1"),
      expiresInSeconds: 900
    };
  }

  private objectUrl(objectKey: string, query: string): string {
    const endpoint = this.config.objectStorageEndpoint.replace(/\/$/, "");
    return `${endpoint}/${this.config.objectStorageBucket}/${objectKey}?${query}`;
  }
}
