import { notFound } from "../../errors.js";
import { allowedWorkflowActions } from "../../authorization.js";
import { groupPhotosByStage } from "../../mappers/publicPayloads.js";
import type { SiteItem, User, WorkflowLog } from "../../types.js";
import type { SiteItemListFilters, SiteItemsRepository } from "../../repositories/site-items/index.js";

export interface SiteItemDetailPayload extends SiteItem {
  photos: ReturnType<typeof groupPhotosByStage>;
  workflowLogs: WorkflowLog[];
  allowedActions: ReturnType<typeof allowedWorkflowActions>;
}

export class SiteItemsService {
  constructor(private readonly repository: SiteItemsRepository) {}

  async list(viewer: User, filters: SiteItemListFilters = {}): Promise<SiteItem[]> {
    return this.repository.list(viewer, filters);
  }

  async detail(viewer: User, itemId: string): Promise<SiteItemDetailPayload> {
    const detail = await this.repository.findDetailById(viewer, itemId);
    if (!detail) throw notFound("Site item not found");

    return {
      ...detail.item,
      photos: groupPhotosByStage(detail.photos),
      workflowLogs: detail.workflowLogs,
      allowedActions: allowedWorkflowActions(viewer, detail.item)
    };
  }
}
