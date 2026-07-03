export type Role = "admin" | "supervisor" | "contractor_manager" | "rectifier";
export type OrganizationType = "owner" | "supervisor" | "contractor" | "other";
export type SiteItemType = "defect" | "punch";
export type SiteItemStatus =
  | "pending_approval"
  | "dispatched"
  | "rectifying"
  | "pending_acceptance"
  | "closed"
  | "voided";
export type Severity = "normal" | "important" | "severe";
export type PhotoStage = "discovery" | "rectification" | "review";
export type UploadState = "pending" | "uploading" | "failed" | "complete";
export type WorkflowAction =
  | "create"
  | "dispatch"
  | "assign_rectifier"
  | "start_rectify"
  | "submit_review"
  | "return_rectification"
  | "close"
  | "void"
  | "reopen"
  | "comment";

export interface Project {
  id: string;
  name: string;
  code: string;
}

export interface Section {
  id: string;
  projectId: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface Organization {
  id: string;
  projectId: string;
  name: string;
  type: OrganizationType;
  isActive: boolean;
}

export interface User {
  id: string;
  organizationId: string;
  name: string;
  phone: string;
  username: string;
  role: Role;
  isActive: boolean;
  sectionScopeIds: string[];
}

export interface Area {
  id: string;
  projectId: string;
  parentId?: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface Discipline {
  id: string;
  projectId: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface DrawingRevisionPage {
  id: string;
  drawingRevisionId: string;
  pageNumber: number;
  previewKey: string;
  width: number;
  height: number;
}

export interface DrawingRevision {
  id: string;
  drawingId: string;
  revisionNo: string;
  fileKey: string;
  coverPreviewKey: string;
  pageCount: number;
  uploadedBy: string;
  uploadedAt: string;
  isCurrent: boolean;
  pages: DrawingRevisionPage[];
}

export interface Drawing {
  id: string;
  projectId: string;
  areaId: string;
  name: string;
  code: string;
  isActive: boolean;
  revisions: DrawingRevision[];
}

export interface PhotoAttachment {
  id: string;
  siteItemId?: string;
  stage?: PhotoStage;
  thumbnailKey: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  sectionSnapshot?: string;
  areaSnapshot?: string;
  disciplineSnapshot?: string;
  responsibleOrgSnapshot?: string;
}

export interface WorkflowLog {
  id: string;
  siteItemId: string;
  action: WorkflowAction;
  fromStatus?: SiteItemStatus;
  toStatus?: SiteItemStatus;
  comment: string;
  actorId: string;
  createdAt: string;
}

export interface SiteItem {
  id: string;
  projectId: string;
  sectionId: string;
  itemNo: string;
  type: SiteItemType;
  status: SiteItemStatus;
  severity: Severity;
  title: string;
  description: string;
  areaId: string;
  disciplineId: string;
  locationText: string;
  responsibleOrgId?: string;
  responsibleUserId?: string;
  createdBy: string;
  ownerUserId: string;
  defaultDueAt: string;
  dueAt: string;
  submittedForReviewAt?: string;
  closedAt?: string;
  reopenedAt?: string;
  voidedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  siteItemId?: string;
  type: "assigned" | "review_requested" | "due_soon" | "overdue" | "voided" | "reopened";
  title: string;
  content: string;
  readAt?: string;
  createdAt: string;
}

export interface ExportJob {
  id: string;
  type: "excel" | "photo_package" | "pdf";
  status: "queued" | "running" | "succeeded" | "failed";
  requestedBy: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
}

export interface UploadQueueItem {
  id: string;
  fileName: string;
  stage: PhotoStage;
  state: UploadState;
  uploadedBy: string;
  siteItemId?: string;
  file?: File;
  objectKey?: string;
  mimeType?: string;
  sizeBytes?: number;
  completeRequestKey?: string;
}

export interface DraftItem {
  id: string;
  title: string;
  savedAt: string;
  createdBy: string;
  values: Partial<SiteItem>;
  selectedPhotoIds?: string[];
}

export interface DashboardSummary {
  total: number;
  open: number;
  pendingReview: number;
  overdue: number;
  closed: number;
}
