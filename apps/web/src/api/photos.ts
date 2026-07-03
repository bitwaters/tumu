import type { PhotoAttachment } from "../types.js";
import type { ApiClient } from "./client.js";

export interface PhotoListQuery {
  unboundOnly?: boolean;
  search?: string;
}

export interface PhotoPreviewResponse {
  previewUrl: string;
  expiresInSeconds: number;
}

export interface PhotoPresignInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PhotoPresignResponse {
  objectKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface PhotoCompleteInput extends PhotoPresignInput {
  objectKey: string;
}

export class PhotosApi {
  constructor(private readonly client: ApiClient) {}

  list(query: PhotoListQuery = {}): Promise<PhotoAttachment[]> {
    return this.client.get<PhotoAttachment[]>("/photos", { query: { ...query } });
  }

  preview(photoId: string): Promise<PhotoPreviewResponse> {
    return this.client.get<PhotoPreviewResponse>(`/photos/${photoId}/preview`);
  }

  presign(input: PhotoPresignInput): Promise<PhotoPresignResponse> {
    return this.client.post<PhotoPresignResponse>("/photos/presign", input);
  }

  complete(input: PhotoCompleteInput, idempotencyKey: string): Promise<PhotoAttachment> {
    return this.client.post<PhotoAttachment>("/photos/complete", input, { idempotencyKey });
  }

  delete(photoId: string, idempotencyKey: string): Promise<PhotoAttachment> {
    return this.client.delete<PhotoAttachment>(`/photos/${photoId}`, { idempotencyKey });
  }
}
