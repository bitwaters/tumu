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
export type NotificationType = "assigned" | "review_requested" | "due_soon" | "overdue" | "voided" | "reopened";
export type ExportType = "excel" | "photo_package" | "pdf" | "audit";
export type ExportStatus = "queued" | "running" | "succeeded" | "failed";
export type ImportKind = "organizations" | "sections" | "areas" | "disciplines" | "users";
export type ImportStatus = "queued" | "running" | "succeeded" | "failed";

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
  passwordHash: string;
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
  disciplineId?: string;
  name: string;
  code: string;
  isActive: boolean;
  revisions: DrawingRevision[];
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

export interface PhotoAttachment {
  id: string;
  siteItemId?: string;
  stage?: PhotoStage;
  objectKey: string;
  thumbnailKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
  deletedAt?: string;
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

export interface Notification {
  id: string;
  recipientId: string;
  siteItemId?: string;
  type: NotificationType;
  title: string;
  content: string;
  readAt?: string;
  createdAt: string;
}

export interface ExportJob {
  id: string;
  type: ExportType;
  status: ExportStatus;
  requestedBy: string;
  params?: Record<string, unknown>;
  artifactKey?: string;
  artifactFileName?: string;
  artifactMimeType?: string;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ImportRowError {
  rowNumber: number;
  field?: string;
  message: string;
}

export interface ImportJob {
  id: string;
  kind: ImportKind;
  status: ImportStatus;
  requestedBy: string;
  sourceFileName?: string;
  acceptedRows: number;
  rejectedRows: number;
  errors: ImportRowError[];
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface IdempotencyRecord {
  id: string;
  actorId: string;
  method: string;
  path: string;
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: string;
  expiresAt: string;
}

export interface Store {
  project: Project;
  sections: Section[];
  organizations: Organization[];
  users: User[];
  areas: Area[];
  disciplines: Discipline[];
  drawings: Drawing[];
  siteItems: SiteItem[];
  photos: PhotoAttachment[];
  workflowLogs: WorkflowLog[];
  notifications: Notification[];
  exportJobs: ExportJob[];
  importJobs: ImportJob[];
  auditLogs: AuditLog[];
  idempotencyRecords: IdempotencyRecord[];
}

export type PublicUser = Omit<User, "passwordHash">;
