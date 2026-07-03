import {
  allowedWorkflowActions,
  publicUser
} from "../authorization.js";
import type {
  Drawing,
  PhotoAttachment,
  PhotoStage,
  SiteItem,
  Store,
  User,
  WorkflowLog
} from "../types.js";

export function mapPublicUser(user: User) {
  return publicUser(user);
}

export function mapUserSectionScopeIds(user: User): string[] {
  return [...user.sectionScopeIds];
}

export function mapDrawingWithCurrentRevision(drawing: Drawing) {
  return {
    ...drawing,
    currentRevision: drawing.revisions.find((revision) => revision.isCurrent)
  };
}

export function groupPhotosByStage(photos: PhotoAttachment[]) {
  return {
    discovery: filterPhotosByStage(photos, "discovery"),
    rectification: filterPhotosByStage(photos, "rectification"),
    review: filterPhotosByStage(photos, "review")
  };
}

export function mapWorkflowLogs(logs: WorkflowLog[]): WorkflowLog[] {
  return [...logs].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function mapSiteItemDetail(store: Store, viewer: User, item: SiteItem) {
  const itemPhotos = store.photos.filter((photo) => photo.siteItemId === item.id && !photo.deletedAt);
  return {
    ...item,
    photos: groupPhotosByStage(itemPhotos),
    workflowLogs: mapWorkflowLogs(store.workflowLogs.filter((log) => log.siteItemId === item.id)),
    allowedActions: allowedWorkflowActions(viewer, item)
  };
}

function filterPhotosByStage(photos: PhotoAttachment[], stage: PhotoStage): PhotoAttachment[] {
  return photos.filter((photo) => photo.stage === stage);
}
