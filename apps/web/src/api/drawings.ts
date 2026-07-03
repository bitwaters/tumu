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

export class DrawingsApi {
  constructor(private readonly client: ApiClient) {}

  list(query: DrawingListQuery = {}): Promise<DrawingWithCurrentRevision[]> {
    return this.client.get<DrawingWithCurrentRevision[]>("/drawings", { query: { ...query } });
  }

  revisions(drawingId: string): Promise<DrawingRevision[]> {
    return this.client.get<DrawingRevision[]>(`/drawings/${drawingId}/revisions`);
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
