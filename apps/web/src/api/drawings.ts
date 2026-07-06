import type { Drawing, DrawingRevision, DrawingRevisionPage } from "../types.js";
import type { ApiClient } from "./client.js";

export interface DrawingListQuery {
  areaId?: string;
  disciplineId?: string;
  search?: string;
}

export interface DrawingWithCurrentRevision extends Drawing {
  currentRevision?: DrawingRevision;
}

export interface DrawingPreviewResponse {
  previewUrl: string;
  expiresInSeconds: number;
}

export interface DrawingUploadTargetInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface DrawingUploadTargetResponse {
  objectKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface CreateDrawingInput {
  areaId: string;
  disciplineId?: string;
  name: string;
  code: string;
}

export interface CreateDrawingRevisionInput {
  revisionNo: string;
  fileKey: string;
  coverPreviewKey?: string;
  pageCount: number;
  isCurrent?: boolean;
}

export class DrawingsApi {
  constructor(private readonly client: ApiClient) {}

  list(query: DrawingListQuery = {}): Promise<DrawingWithCurrentRevision[]> {
    return this.client.get<DrawingWithCurrentRevision[]>("/drawings", { query: { ...query } });
  }

  uploadTarget(input: DrawingUploadTargetInput): Promise<DrawingUploadTargetResponse> {
    return this.client.post<DrawingUploadTargetResponse>("/drawings/upload-target", input);
  }

  create(input: CreateDrawingInput): Promise<Drawing> {
    return this.client.post<Drawing>("/drawings", input);
  }

  revisions(drawingId: string): Promise<DrawingRevision[]> {
    return this.client.get<DrawingRevision[]>(`/drawings/${drawingId}/revisions`);
  }

  createRevision(drawingId: string, input: CreateDrawingRevisionInput): Promise<DrawingRevision> {
    return this.client.post<DrawingRevision>(`/drawings/${drawingId}/revisions`, input);
  }

  pages(revisionId: string): Promise<DrawingRevisionPage[]> {
    return this.client.get<DrawingRevisionPage[]>(`/drawing-revisions/${revisionId}/pages`);
  }

  preview(revisionId: string): Promise<DrawingPreviewResponse> {
    return this.client.get<DrawingPreviewResponse>(`/drawing-revisions/${revisionId}/preview`);
  }

  setCurrentRevision(revisionId: string): Promise<DrawingRevision> {
    return this.client.patch<DrawingRevision>(`/drawing-revisions/${revisionId}/current`, {});
  }
}
