import { badRequest, forbidden, notFound } from "../../errors.js";
import { allowedWorkflowActions, canAccessSection, canAssignRectifier, canWorkflowOwner } from "../../authorization.js";
import { AuditRepository } from "../../repositories/audit/index.js";
import { NotificationsRepository } from "../../repositories/notifications/index.js";
import { groupPhotosByStage } from "../../mappers/publicPayloads.js";
import type { NotificationType, PhotoStage, Severity, SiteItem, SiteItemStatus, SiteItemType, User, WorkflowAction, WorkflowLog } from "../../types.js";
import { SiteItemsRepository } from "../../repositories/site-items/index.js";
import type { SiteItemListFilters, UpdateSiteItemRecordInput } from "../../repositories/site-items/index.js";
import type { IdempotencyRequest } from "../idempotency/index.js";
import { IdempotencyService } from "../idempotency/index.js";

export interface SiteItemDetailPayload extends SiteItem {
  photos: ReturnType<typeof groupPhotosByStage>;
  workflowLogs: WorkflowLog[];
  allowedActions: ReturnType<typeof allowedWorkflowActions>;
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
  responsibleOrgId?: string;
  responsibleUserId?: string;
  dueAt?: string;
  photoIds?: string[];
}

export interface UpdateSiteItemInput {
  type?: SiteItemType;
  severity?: Severity;
  title?: string;
  description?: string;
  sectionId?: string;
  areaId?: string;
  disciplineId?: string;
  locationText?: string;
  dueAt?: string;
}

export interface SiteItemTransitionInput {
  responsibleOrgId?: string;
  responsibleUserId?: string;
  photoIds?: string[];
  comment?: string;
}

export class SiteItemsService {
  constructor(
    private readonly repository: SiteItemsRepository,
    private readonly auditRepository: AuditRepository,
    private readonly idempotencyService: IdempotencyService,
    private readonly notificationsRepository: NotificationsRepository
  ) {}

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

  async create(viewer: User, input: CreateSiteItemInput, idempotency?: Pick<IdempotencyRequest, "key" | "method" | "path">): Promise<SiteItemDetailPayload> {
    if (viewer.role !== "admin" && viewer.role !== "supervisor") throw forbidden();
    validateCreateInput(input);
    if (!canAccessSection(viewer, input.sectionId!)) throw forbidden();

    return this.repository.transaction(async (context) => {
      const repository = this.repository.withContext(context);
      const auditRepository = this.auditRepository.withContext(context);
      const idempotencyService = this.idempotencyService.withContext(context);
      return idempotencyService.run(
        {
          actorId: viewer.id,
          method: idempotency?.method ?? "POST",
          path: idempotency?.path ?? "/site-items",
          key: idempotency?.key,
          requestBody: input
        },
        async () => {
          await validateReferences(repository, input);
          const assignment: { responsibleOrgId?: string; responsibleUserId?: string } =
            input.responsibleOrgId || input.responsibleUserId
              ? await validateResponsibleAssignment(repository, input.sectionId!, input.responsibleOrgId ?? "", input.responsibleUserId)
              : {};
          const projectId = await repository.findDefaultProjectId();
          if (!projectId) throw badRequest("project is not initialized");
          const severity = input.severity ?? "normal";
          const dueAt = parseDueAt(input.dueAt) ?? defaultDueAt(severity);
          const item = await repository.create({
            projectId,
            sectionId: input.sectionId!,
            itemNo: await repository.nextItemNo(),
            type: input.type ?? "defect",
            status: "pending_approval",
            severity,
            title: input.title ?? "未命名事项",
            description: input.description ?? "",
            areaId: input.areaId!,
            disciplineId: input.disciplineId!,
            locationText: input.locationText ?? "",
            responsibleOrgId: assignment.responsibleOrgId,
            responsibleUserId: assignment.responsibleUserId,
            createdBy: viewer.id,
            ownerUserId: viewer.id,
            defaultDueAt: defaultDueAt(severity),
            dueAt
          });
          await repository.bindUnboundPhotos(viewer, item, input.photoIds ?? [], "discovery");
          await repository.createWorkflowLog({
            siteItemId: item.id,
            action: "create",
            toStatus: "pending_approval",
            actorId: viewer.id,
            comment: "提交待审核事项"
          });
          await auditRepository.create({
            actorId: viewer.id,
            action: "create",
            resourceType: "SiteItem",
            resourceId: item.id
          });
          return { body: await detailPayload(repository, viewer, item.id) };
        }
      );
    });
  }

  async update(viewer: User, itemId: string, input: UpdateSiteItemInput, idempotency?: Pick<IdempotencyRequest, "key" | "method" | "path">): Promise<SiteItemDetailPayload> {
    return this.repository.transaction(async (context) => {
      const repository = this.repository.withContext(context);
      const auditRepository = this.auditRepository.withContext(context);
      const idempotencyService = this.idempotencyService.withContext(context);
      return idempotencyService.run(
        {
          actorId: viewer.id,
          method: idempotency?.method ?? "PATCH",
          path: idempotency?.path ?? `/site-items/${itemId}`,
          key: idempotency?.key,
          requestBody: input
        },
        async () => {
          const detail = await repository.findDetailById(viewer, itemId);
          if (!detail) throw notFound("Site item not found");
          if (!canWorkflowOwner(viewer, detail.item) || detail.item.status === "closed" || detail.item.status === "voided") {
            throw forbidden();
          }
          if (input.sectionId && !canAccessSection(viewer, input.sectionId)) throw forbidden();
          await validateReferences(repository, input, true);
          await validateExistingAssignment(repository, detail.item, input);
          const updated = await repository.update(itemId, normalizeUpdateInput(input));
          if (!updated) throw notFound("Site item not found");
          await auditRepository.create({
            actorId: viewer.id,
            action: "update",
            resourceType: "SiteItem",
            resourceId: itemId
          });
          return { body: await detailPayload(repository, viewer, itemId) };
        }
      );
    });
  }

  async transition(
    viewer: User,
    itemId: string,
    action: WorkflowAction,
    input: SiteItemTransitionInput = {},
    idempotency?: Pick<IdempotencyRequest, "key" | "method" | "path">
  ): Promise<SiteItemDetailPayload> {
    return this.repository.transaction(async (context) => {
      const repository = this.repository.withContext(context);
      const auditRepository = this.auditRepository.withContext(context);
      const notificationsRepository = this.notificationsRepository.withContext(context);
      const idempotencyService = this.idempotencyService.withContext(context);
      return idempotencyService.run(
        {
          actorId: viewer.id,
          method: idempotency?.method ?? "POST",
          path: idempotency?.path ?? `/site-items/${itemId}/${workflowPathSegment(action)}`,
          key: idempotency?.key,
          requestBody: input
        },
        async () => {
          const detail = await repository.findDetailById(viewer, itemId);
          if (!detail) throw notFound("Site item not found");
          const fromStatus = detail.item.status;
          const workflow = await resolveWorkflowUpdate(repository, viewer, detail.item, action, input);
          let updated = detail.item;
          if (workflow.update) {
            const saved = await repository.updateWorkflow(itemId, workflow.update);
            if (!saved) throw notFound("Site item not found");
            updated = saved;
          }
          if (workflow.photoStage) {
            await repository.bindUnboundPhotos(viewer, updated, input.photoIds ?? [], workflow.photoStage);
          }
          if (workflow.notification?.recipientId) {
            await notificationsRepository.create({
              recipientId: workflow.notification.recipientId,
              siteItemId: itemId,
              type: workflow.notification.type,
              title: workflow.notification.title,
              content: workflow.notification.content
            });
          }
          await repository.createWorkflowLog({
            siteItemId: itemId,
            action,
            fromStatus,
            toStatus: updated.status,
            actorId: viewer.id,
            comment: workflow.comment
          });
          await auditRepository.create({
            actorId: viewer.id,
            action,
            resourceType: "SiteItem",
            resourceId: itemId
          });
          return { body: await detailPayload(repository, viewer, itemId) };
        }
      );
    });
  }
}

async function detailPayload(repository: SiteItemsRepository, viewer: User, itemId: string): Promise<SiteItemDetailPayload> {
  const detail = await repository.findDetailById(viewer, itemId);
  if (!detail) throw notFound("Site item not found");
  return {
    ...detail.item,
    photos: groupPhotosByStage(detail.photos),
    workflowLogs: detail.workflowLogs,
    allowedActions: allowedWorkflowActions(viewer, detail.item)
  };
}

function validateCreateInput(input: CreateSiteItemInput): void {
  if (!input.sectionId || !input.areaId || !input.disciplineId) throw badRequest("sectionId, areaId and disciplineId are required");
  validateEnums(input);
  if (input.title !== undefined && !input.title.trim()) throw badRequest("title is required");
  if (input.photoIds && new Set(input.photoIds).size !== input.photoIds.length) throw badRequest("photoIds include duplicate photo");
}

function validateEnums(input: Partial<CreateSiteItemInput & UpdateSiteItemInput>): void {
  if (input.type && !["defect", "punch"].includes(input.type)) throw badRequest("type is invalid");
  if (input.severity && !["normal", "important", "severe"].includes(input.severity)) throw badRequest("severity is invalid");
}

async function validateReferences(repository: SiteItemsRepository, input: Partial<CreateSiteItemInput & UpdateSiteItemInput>, partial = false): Promise<void> {
  validateEnums(input);
  if (!partial || input.sectionId !== undefined) {
    if (!input.sectionId || !(await repository.existsActiveSection(input.sectionId))) throw badRequest("sectionId is invalid");
  }
  if (!partial || input.areaId !== undefined) {
    if (!input.areaId || !(await repository.existsActiveArea(input.areaId))) throw badRequest("areaId is invalid");
  }
  if (!partial || input.disciplineId !== undefined) {
    if (!input.disciplineId || !(await repository.existsActiveDiscipline(input.disciplineId))) throw badRequest("disciplineId is invalid");
  }
}

async function validateResponsibleAssignment(
  repository: SiteItemsRepository,
  sectionId: string,
  responsibleOrgId: string,
  responsibleUserId?: string
): Promise<{ responsibleOrgId: string; responsibleUserId?: string }> {
  const organization = await repository.findOrganizationById(responsibleOrgId);
  if (!organization?.isActive || organization.type !== "contractor") {
    throw badRequest("responsibleOrgId must be an active contractor organization");
  }
  if (!responsibleUserId) return { responsibleOrgId };

  const rectifier = await repository.findUserById(responsibleUserId);
  if (!rectifier?.isActive || rectifier.role !== "rectifier") throw badRequest("responsibleUserId must be an active rectifier");
  if (rectifier.organizationId !== responsibleOrgId) throw badRequest("responsibleUserId must belong to responsibleOrgId");
  if (!canAccessSection(rectifier, sectionId)) throw badRequest("responsibleUserId is outside the item section scope");
  return { responsibleOrgId, responsibleUserId };
}

async function validateExistingAssignment(repository: SiteItemsRepository, item: SiteItem, input: UpdateSiteItemInput): Promise<void> {
  if (!input.sectionId || !item.responsibleOrgId) return;
  await validateResponsibleAssignment(repository, input.sectionId, item.responsibleOrgId, item.responsibleUserId);
}

function normalizeUpdateInput(input: UpdateSiteItemInput): UpdateSiteItemRecordInput {
  return {
    type: input.type,
    severity: input.severity,
    title: input.title,
    description: input.description,
    sectionId: input.sectionId,
    areaId: input.areaId,
    disciplineId: input.disciplineId,
    locationText: input.locationText,
    dueAt: parseDueAt(input.dueAt)
  };
}

function parseDueAt(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest("dueAt is invalid");
  return date;
}

function defaultDueAt(severity: Severity = "normal"): Date {
  const hours = severity === "severe" ? 24 : severity === "important" ? 72 : 120;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

interface WorkflowResolution {
  update?: {
    status?: SiteItemStatus;
    responsibleOrgId?: string;
    responsibleUserId?: string;
    submittedForReviewAt?: Date;
    closedAt?: Date;
    reopenedAt?: Date;
    voidedAt?: Date;
  };
  photoStage?: PhotoStage;
  notification?: {
    recipientId?: string;
    type: NotificationType;
    title: string;
    content: string;
  };
  comment: string;
}

async function resolveWorkflowUpdate(
  repository: SiteItemsRepository,
  viewer: User,
  item: SiteItem,
  action: WorkflowAction,
  input: SiteItemTransitionInput
): Promise<WorkflowResolution> {
  const comment = input.comment ?? "";
  if (action === "dispatch") {
    if (!canWorkflowOwner(viewer, item) || item.status !== "pending_approval") throw forbidden();
    const assignment = await validateResponsibleAssignment(repository, item.sectionId, input.responsibleOrgId ?? "", input.responsibleUserId);
    return {
      update: {
        status: "dispatched",
        responsibleOrgId: assignment.responsibleOrgId,
        responsibleUserId: assignment.responsibleUserId
      },
      notification: {
        recipientId: assignment.responsibleUserId,
        type: "assigned",
        title: "新整改任务",
        content: item.title
      },
      comment
    };
  }

  if (action === "assign_rectifier") {
    if (!canAssignRectifier(viewer, item) || item.status === "closed" || item.status === "voided") throw forbidden();
    const assignment = await validateResponsibleAssignment(repository, item.sectionId, item.responsibleOrgId ?? "", input.responsibleUserId ?? "");
    return {
      update: {
        responsibleUserId: assignment.responsibleUserId
      },
      notification: {
        recipientId: assignment.responsibleUserId,
        type: "assigned",
        title: "整改任务已分配",
        content: item.title
      },
      comment
    };
  }

  if (action === "start_rectify") {
    if (item.status !== "dispatched" || item.responsibleUserId !== viewer.id) throw forbidden();
    return { update: { status: "rectifying" }, comment };
  }

  if (action === "submit_review") {
    if (item.status !== "rectifying" || item.responsibleUserId !== viewer.id) throw forbidden();
    return {
      update: {
        status: "pending_acceptance",
        submittedForReviewAt: new Date()
      },
      photoStage: "rectification",
      notification: {
        recipientId: item.ownerUserId,
        type: "review_requested",
        title: "待复验事项",
        content: item.title
      },
      comment
    };
  }

  if (action === "close") {
    if (!canWorkflowOwner(viewer, item) || item.status !== "pending_acceptance") throw forbidden();
    return { update: { status: "closed", closedAt: new Date() }, photoStage: "review", comment };
  }

  if (action === "void") {
    if (!canWorkflowOwner(viewer, item) || item.status === "closed") throw forbidden();
    return {
      update: { status: "voided", voidedAt: new Date() },
      notification: {
        recipientId: item.responsibleUserId,
        type: "voided",
        title: "事项已作废",
        content: item.title
      },
      comment
    };
  }

  if (action === "reopen") {
    if (!canWorkflowOwner(viewer, item) || (item.status !== "closed" && item.status !== "voided")) throw forbidden();
    return {
      update: {
        status: item.responsibleUserId ? "rectifying" : item.responsibleOrgId ? "dispatched" : "pending_approval",
        reopenedAt: new Date()
      },
      notification: {
        recipientId: item.responsibleUserId,
        type: "reopened",
        title: "事项已重开",
        content: item.title
      },
      comment
    };
  }

  if (action === "comment") {
    if (!comment) throw badRequest("comment is required");
    return { comment };
  }

  throw badRequest("workflow action is invalid");
}

function workflowPathSegment(action: WorkflowAction): string {
  if (action === "assign_rectifier") return "assign-rectifier";
  if (action === "start_rectify") return "start-rectify";
  if (action === "submit_review") return "submit-review";
  if (action === "comment") return "comments";
  return action;
}
