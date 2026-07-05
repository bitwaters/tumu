import type { PhotoAttachment, PhotoStage, SiteItem, Severity, SiteItemStatus, SiteItemType, WorkflowAction, WorkflowLog } from "../types.js";
import type { ApiClient } from "./client.js";

export interface SiteItemListQuery {
  search?: string;
  status?: SiteItemStatus;
  type?: SiteItemType;
  severity?: Severity;
  sectionId?: string;
  areaId?: string;
  disciplineId?: string;
  organizationId?: string;
  overdue?: boolean;
}

export type GroupedItemPhotos = Record<PhotoStage, PhotoAttachment[]>;

export interface SiteItemDetailPayload extends SiteItem {
  photos: GroupedItemPhotos;
  workflowLogs: WorkflowLog[];
  allowedActions: WorkflowAction[];
}

export interface SiteItemListPayload extends SiteItem {
  allowedActions?: WorkflowAction[];
}

export interface CreateSiteItemInput {
  sectionId?: string;
  type?: SiteItemType;
  severity?: Severity;
  title?: string;
  description?: string;
  areaId?: string;
  disciplineId?: string;
  locationText?: string;
  dueAt?: string;
  photoIds?: string[];
}

export interface UpdateSiteItemInput extends Partial<Omit<CreateSiteItemInput, "photoIds">> {}

export interface SiteItemWorkflowInput {
  responsibleOrgId?: string;
  responsibleUserId?: string;
  photoIds?: string[];
  comment?: string;
}

export class SiteItemsApi {
  constructor(private readonly client: ApiClient) {}

  list(query: SiteItemListQuery = {}): Promise<SiteItemListPayload[]> {
    return this.client.get<SiteItemListPayload[]>("/site-items", { query: { ...query } });
  }

  detail(itemId: string): Promise<SiteItemDetailPayload> {
    return this.client.get<SiteItemDetailPayload>(`/site-items/${itemId}`);
  }

  create(input: CreateSiteItemInput, idempotencyKey: string): Promise<SiteItemDetailPayload> {
    return this.client.post<SiteItemDetailPayload>("/site-items", input, { idempotencyKey });
  }

  update(itemId: string, input: UpdateSiteItemInput, idempotencyKey: string): Promise<SiteItemDetailPayload> {
    return this.client.patch<SiteItemDetailPayload>(`/site-items/${itemId}`, input, { idempotencyKey });
  }

  workflow(itemId: string, action: WorkflowAction, input: SiteItemWorkflowInput, idempotencyKey: string): Promise<SiteItemDetailPayload> {
    return this.client.post<SiteItemDetailPayload>(`/site-items/${itemId}/${workflowPath(action)}`, input, { idempotencyKey });
  }
}

export function flattenGroupedPhotos(groups: GroupedItemPhotos): PhotoAttachment[] {
  return [...groups.discovery, ...groups.rectification, ...groups.review];
}

function workflowPath(action: WorkflowAction): string {
  const paths: Partial<Record<WorkflowAction, string>> = {
    assign_rectifier: "assign-rectifier",
    start_rectify: "start-rectify",
    submit_review: "submit-review",
    return_rectification: "return-rectification",
    comment: "comments"
  };
  return paths[action] ?? action;
}
