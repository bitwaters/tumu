import type {
  Drawing,
  DrawingRevision,
  DrawingRevisionPage,
  ExportJob,
  ImportJob,
  ImportRowError,
  PhotoAttachment,
  AuditLog,
  Notification,
  SiteItem,
  User,
  WorkflowLog
} from "../types.js";

export interface UserRecordWithScopes {
  id: string;
  organizationId: string;
  name: string;
  phone: string;
  username: string;
  role: User["role"];
  isActive: boolean;
  passwordHash: string;
  sectionScopes?: Array<{ sectionId: string }>;
}

export function mapUserRecord(record: UserRecordWithScopes): User {
  return {
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    phone: record.phone,
    username: record.username,
    role: record.role,
    isActive: record.isActive,
    passwordHash: record.passwordHash,
    sectionScopeIds: record.sectionScopes?.map((scope) => scope.sectionId) ?? []
  };
}

export interface DrawingPageRecord {
  id: string;
  drawingRevisionId: string;
  pageNumber: number;
  previewKey: string;
  width: number;
  height: number;
}

export interface DrawingRevisionRecord {
  id: string;
  drawingId: string;
  revisionNo: string;
  fileKey: string;
  coverPreviewKey: string;
  pageCount: number;
  uploadedBy: string;
  uploadedAt: Date;
  isCurrent: boolean;
  pages?: DrawingPageRecord[];
}

export interface DrawingRecord {
  id: string;
  projectId: string;
  areaId: string;
  disciplineId: string | null;
  name: string;
  code: string;
  isActive: boolean;
  revisions?: DrawingRevisionRecord[];
}

export function mapDrawingRecord(record: DrawingRecord): Drawing {
  return {
    id: record.id,
    projectId: record.projectId,
    areaId: record.areaId,
    disciplineId: record.disciplineId ?? undefined,
    name: record.name,
    code: record.code,
    isActive: record.isActive,
    revisions: record.revisions?.map(mapDrawingRevisionRecord) ?? []
  };
}

export function mapDrawingRevisionRecord(record: DrawingRevisionRecord): DrawingRevision {
  return {
    id: record.id,
    drawingId: record.drawingId,
    revisionNo: record.revisionNo,
    fileKey: record.fileKey,
    coverPreviewKey: record.coverPreviewKey,
    pageCount: record.pageCount,
    uploadedBy: record.uploadedBy,
    uploadedAt: record.uploadedAt.toISOString(),
    isCurrent: record.isCurrent,
    pages: record.pages?.map(mapDrawingPageRecord) ?? []
  };
}

export function mapDrawingPageRecord(record: DrawingPageRecord): DrawingRevisionPage {
  return { ...record };
}

export interface SiteItemRecord {
  id: string;
  projectId: string;
  sectionId: string;
  itemNo: string;
  type: SiteItem["type"];
  status: SiteItem["status"];
  severity: SiteItem["severity"];
  title: string;
  description: string;
  areaId: string;
  disciplineId: string;
  locationText: string;
  responsibleOrgId: string | null;
  responsibleUserId: string | null;
  createdBy: string;
  ownerUserId: string;
  defaultDueAt: Date;
  dueAt: Date;
  submittedForReviewAt: Date | null;
  closedAt: Date | null;
  reopenedAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    photos: number;
  };
}

export interface PhotoAttachmentRecord {
  id: string;
  siteItemId: string | null;
  stage: PhotoAttachment["stage"] | null;
  objectKey: string;
  thumbnailKey: string;
  storageProfileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: Date;
  deletedAt: Date | null;
  sectionSnapshot: string | null;
  areaSnapshot: string | null;
  disciplineSnapshot: string | null;
  responsibleOrgSnapshot: string | null;
}

export interface WorkflowLogRecord {
  id: string;
  siteItemId: string;
  action: WorkflowLog["action"];
  fromStatus: WorkflowLog["fromStatus"] | null;
  toStatus: WorkflowLog["toStatus"] | null;
  comment: string;
  actorId: string;
  createdAt: Date;
}

export function mapSiteItemRecord(record: SiteItemRecord): SiteItem {
  return {
    id: record.id,
    projectId: record.projectId,
    sectionId: record.sectionId,
    itemNo: record.itemNo,
    type: record.type,
    status: record.status,
    severity: record.severity,
    title: record.title,
    description: record.description,
    areaId: record.areaId,
    disciplineId: record.disciplineId,
    locationText: record.locationText,
    responsibleOrgId: record.responsibleOrgId ?? undefined,
    responsibleUserId: record.responsibleUserId ?? undefined,
    createdBy: record.createdBy,
    ownerUserId: record.ownerUserId,
    defaultDueAt: record.defaultDueAt.toISOString(),
    dueAt: record.dueAt.toISOString(),
    submittedForReviewAt: record.submittedForReviewAt?.toISOString(),
    closedAt: record.closedAt?.toISOString(),
    reopenedAt: record.reopenedAt?.toISOString(),
    voidedAt: record.voidedAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    photoCount: record._count?.photos
  };
}

export function mapPhotoAttachmentRecord(record: PhotoAttachmentRecord): PhotoAttachment {
  return {
    id: record.id,
    siteItemId: record.siteItemId ?? undefined,
    stage: record.stage ?? undefined,
    objectKey: record.objectKey,
    thumbnailKey: record.thumbnailKey,
    storageProfileId: record.storageProfileId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    uploadedBy: record.uploadedBy,
    uploadedAt: record.uploadedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString(),
    sectionSnapshot: record.sectionSnapshot ?? undefined,
    areaSnapshot: record.areaSnapshot ?? undefined,
    disciplineSnapshot: record.disciplineSnapshot ?? undefined,
    responsibleOrgSnapshot: record.responsibleOrgSnapshot ?? undefined
  };
}

export function mapWorkflowLogRecord(record: WorkflowLogRecord): WorkflowLog {
  return {
    id: record.id,
    siteItemId: record.siteItemId,
    action: record.action,
    fromStatus: record.fromStatus ?? undefined,
    toStatus: record.toStatus ?? undefined,
    comment: record.comment,
    actorId: record.actorId,
    createdAt: record.createdAt.toISOString()
  };
}

export interface NotificationRecord {
  id: string;
  recipientId: string;
  siteItemId: string | null;
  type: Notification["type"];
  title: string;
  content: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface ExportJobRecord {
  id: string;
  type: ExportJob["type"];
  status: ExportJob["status"];
  requestedBy: string;
  params: unknown;
  artifactKey: string | null;
  artifactFileName: string | null;
  artifactMimeType: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface ImportJobRecord {
  id: string;
  kind: ImportJob["kind"];
  status: ImportJob["status"];
  requestedBy: string;
  sourceFileName: string | null;
  acceptedRows: number;
  rejectedRows: number;
  errors: unknown;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface AuditLogRecord {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: unknown;
  createdAt: Date;
}

export function mapNotificationRecord(record: NotificationRecord): Notification {
  return {
    id: record.id,
    recipientId: record.recipientId,
    siteItemId: record.siteItemId ?? undefined,
    type: record.type,
    title: record.title,
    content: record.content,
    readAt: record.readAt?.toISOString(),
    createdAt: record.createdAt.toISOString()
  };
}

export function mapExportJobRecord(record: ExportJobRecord): ExportJob {
  return {
    id: record.id,
    type: record.type,
    status: record.status,
    requestedBy: record.requestedBy,
    params: isRecord(record.params) ? record.params : undefined,
    artifactKey: record.artifactKey ?? undefined,
    artifactFileName: record.artifactFileName ?? undefined,
    artifactMimeType: record.artifactMimeType ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
    createdAt: record.createdAt.toISOString(),
    startedAt: record.startedAt?.toISOString(),
    completedAt: record.completedAt?.toISOString()
  };
}

export function mapImportJobRecord(record: ImportJobRecord): ImportJob {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    requestedBy: record.requestedBy,
    sourceFileName: record.sourceFileName ?? undefined,
    acceptedRows: record.acceptedRows,
    rejectedRows: record.rejectedRows,
    errors: parseImportErrors(record.errors),
    errorMessage: record.errorMessage ?? undefined,
    createdAt: record.createdAt.toISOString(),
    startedAt: record.startedAt?.toISOString(),
    completedAt: record.completedAt?.toISOString()
  };
}

export function mapAuditLogRecord(record: AuditLogRecord): AuditLog {
  return {
    id: record.id,
    actorId: record.actorId,
    action: record.action,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    metadata: isRecord(record.metadata) ? record.metadata : undefined,
    createdAt: record.createdAt.toISOString()
  };
}

function parseImportErrors(value: unknown): ImportRowError[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isImportRowError);
}

function isImportRowError(value: unknown): value is ImportRowError {
  if (!isRecord(value)) return false;
  if (typeof value.rowNumber !== "number" || !Number.isInteger(value.rowNumber)) return false;
  if (value.field !== undefined && typeof value.field !== "string") return false;
  return typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
