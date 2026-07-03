import type { ApiConfig } from "./config.js";
import { ObjectStorageClient } from "./storage.js";
import { newId } from "./data.js";
import { badRequest, forbidden, notFound, unauthorized } from "./errors.js";
import {
  Router,
  assertRecord,
  authenticate,
  mapForbidden,
  readString,
  readStringArray,
  requireContext
} from "./http.js";
import { withIdempotency } from "./idempotency.js";
import { writeAudit } from "./audit.js";
import { hashPassword, issueToken, verifyPassword } from "./security.js";
import { withStoreTransaction } from "./transaction.js";
import {
  canAccessItem,
  canAccessSection,
  canAssignRectifier,
  allowedWorkflowActions,
  canWorkflowOwner,
  publicUser,
  requireAdmin,
  visibleItems
} from "./authorization.js";
import type {
  Area,
  Discipline,
  Drawing,
  DrawingRevision,
  Organization,
  PhotoAttachment,
  Section,
  SiteItem,
  SiteItemStatus,
  Store,
  User,
  WorkflowAction
} from "./types.js";

type MutableMaster = Section | Organization | Area | Discipline;

export function buildRouter(store: Store, config: ApiConfig): Router {
  const router = new Router();
  const storage = new ObjectStorageClient(config);

  router.add("GET", "/health", () => ({
    service: "@site-management/api",
    status: "ok",
    time: new Date().toISOString()
  }));

  router.add("GET", "/ready", () => ({
    status: "ok",
    dependencies: {
      postgresql: { status: "configured", url: redact(config.databaseUrl) },
      redis: { status: "configured", url: config.redisUrl },
      objectStorage: { status: "configured", endpoint: config.objectStorageEndpoint, bucket: config.objectStorageBucket }
    }
  }));

  router.add("POST", "/auth/login", (request) => {
    const body = assertRecord(request.body);
    const account = readString(body, "username", false) ?? readString(body, "phone", false);
    if (!account) throw badRequest("username or phone is required");
    const password = readString(body, "password");
    const user = store.users.find((candidate) => (candidate.username === account || candidate.phone === account) && candidate.isActive);
    if (!user || !password || !verifyPassword(password, user.passwordHash)) throw unauthorized("Invalid credentials");
    writeAudit(store, user.id, "login", "User", user.id);
    return { accessToken: issueToken(user.id, config), user: publicUser(user) };
  });

  router.add("POST", "/auth/logout", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    writeAudit(store, user.id, "logout", "User", user.id);
    return { ok: true };
  });

  router.add("GET", "/auth/me", (request) => {
    authenticate(request, store, config);
    return { user: publicUser(requireContext(request).user) };
  });

  router.add("GET", "/users", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    mapForbidden(() => requireAdmin(user));
    const search = request.query.get("search")?.toLowerCase();
    const role = request.query.get("role");
    const active = parseOptionalBoolean(request.query.get("active"));
    return store.users
      .filter((candidate) => !role || candidate.role === role)
      .filter((candidate) => active === undefined || candidate.isActive === active)
      .filter((candidate) => !search || `${candidate.name} ${candidate.username} ${candidate.phone}`.toLowerCase().includes(search))
      .map(publicUser);
  });

  router.add("POST", "/users", async (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    mapForbidden(() => requireAdmin(user));
    return withIdempotency(store, config, request, user.id, () => {
      const body = assertRecord(request.body);
      const created: User = {
        id: newId("user"),
        organizationId: readString(body, "organizationId") ?? "",
        name: readString(body, "name") ?? "",
        phone: readString(body, "phone") ?? "",
        username: readString(body, "username") ?? "",
        role: (readString(body, "role") as User["role"]) ?? "rectifier",
        isActive: true,
        sectionScopeIds: readStringArray(body, "sectionScopeIds"),
        passwordHash: hashPassword(readString(body, "password") ?? "password123")
      };
      validateUser(store, created);
      store.users.push(created);
      writeAudit(store, user.id, "create", "User", created.id);
      return { body: publicUser(created) };
    });
  });

  router.add("PATCH", "/users/:id", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    mapForbidden(() => requireAdmin(user));
    const target = mustFind(store.users, request.params.id, "User");
    const body = assertRecord(request.body);
    const changes = pickDefined({
      organizationId: optionalString(body.organizationId),
      name: optionalString(body.name),
      phone: optionalString(body.phone),
      username: optionalString(body.username),
      role: optionalString(body.role) as User["role"] | undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      sectionScopeIds: Array.isArray(body.sectionScopeIds) ? readStringArray(body, "sectionScopeIds") : undefined
    });
    const updated = { ...target, ...changes };
    validateUser(store, updated);
    Object.assign(target, changes);
    writeAudit(store, user.id, "update", "User", target.id);
    return publicUser(target);
  });

  router.add("PATCH", "/users/:id/disable", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    mapForbidden(() => requireAdmin(user));
    const target = mustFind(store.users, request.params.id, "User");
    target.isActive = false;
    writeAudit(store, user.id, "disable", "User", target.id);
    return publicUser(target);
  });

  router.add("POST", "/users/:id/reset-password", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    mapForbidden(() => requireAdmin(user));
    const target = mustFind(store.users, request.params.id, "User");
    const body = assertRecord(request.body);
    target.passwordHash = hashPassword(readString(body, "password") ?? "password123");
    writeAudit(store, user.id, "reset_password", "User", target.id);
    return { ok: true };
  });

  registerMasterData(router, store, config, "sections", store.sections);
  registerMasterData(router, store, config, "organizations", store.organizations);
  registerMasterData(router, store, config, "areas", store.areas);
  registerMasterData(router, store, config, "disciplines", store.disciplines);

  router.add("GET", "/drawings", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const areaId = request.query.get("areaId");
    const disciplineId = request.query.get("disciplineId");
    const search = request.query.get("search")?.toLowerCase();
    return store.drawings
      .filter((drawing) => !areaId || drawing.areaId === areaId)
      .filter((drawing) => !disciplineId || drawing.disciplineId === disciplineId)
      .filter((drawing) => !search || `${drawing.name} ${drawing.code}`.toLowerCase().includes(search))
      .filter((drawing) => canAccessDrawing(user, store, drawing))
      .map((drawing) => ({ ...drawing, currentRevision: drawing.revisions.find((revision) => revision.isCurrent) }));
  });

  router.add("POST", "/drawings", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    mapForbidden(() => requireAdmin(user));
    const body = assertRecord(request.body);
    const drawing: Drawing = {
      id: newId("drawing"),
      projectId: store.project.id,
      areaId: readString(body, "areaId") ?? "",
      disciplineId: readString(body, "disciplineId", false),
      name: readString(body, "name") ?? "",
      code: readString(body, "code") ?? "",
      isActive: true,
      revisions: []
    };
    store.drawings.push(drawing);
    writeAudit(store, user.id, "create", "Drawing", drawing.id);
    return drawing;
  });

  router.add("PATCH", "/drawings/:id", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    mapForbidden(() => requireAdmin(user));
    const drawing = mustFind(store.drawings, request.params.id, "Drawing");
    Object.assign(drawing, pickDefined(assertRecord(request.body)));
    writeAudit(store, user.id, "update", "Drawing", drawing.id);
    return drawing;
  });

  router.add("POST", "/drawings/:id/revisions", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    mapForbidden(() => requireAdmin(user));
    const drawing = mustFind(store.drawings, request.params.id, "Drawing");
    const body = assertRecord(request.body);
    const pageCount = Number(body.pageCount ?? 1);
    const revision: DrawingRevision = {
      id: newId("rev"),
      drawingId: drawing.id,
      revisionNo: readString(body, "revisionNo") ?? "A",
      fileKey: readString(body, "fileKey") ?? `drawings/${drawing.id}.pdf`,
      coverPreviewKey: readString(body, "coverPreviewKey", false) ?? `drawings/${drawing.id}-p1.png`,
      pageCount,
      uploadedBy: user.id,
      uploadedAt: new Date().toISOString(),
      isCurrent: Boolean(body.isCurrent),
      pages: Array.from({ length: pageCount }, (_, index) => ({
        id: newId("page"),
        drawingRevisionId: "",
        pageNumber: index + 1,
        previewKey: `${drawing.code}-p${index + 1}`,
        width: 1600,
        height: 1000
      }))
    };
    revision.pages = revision.pages.map((page) => ({ ...page, drawingRevisionId: revision.id }));
    if (revision.isCurrent) drawing.revisions.forEach((candidate) => (candidate.isCurrent = false));
    drawing.revisions.unshift(revision);
    writeAudit(store, user.id, "upload_revision", "DrawingRevision", revision.id);
    return revision;
  });

  router.add("GET", "/drawings/:id/revisions", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const drawing = mustFind(store.drawings, request.params.id, "Drawing");
    if (!canAccessDrawing(user, store, drawing)) throw notFound("Drawing not found");
    return drawing.revisions;
  });

  router.add("GET", "/drawing-revisions/:id/pages", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const { drawing, revision } = mustFindRevision(store, request.params.id);
    if (!canAccessDrawing(user, store, drawing)) throw notFound("Drawing revision not found");
    return revision.pages;
  });

  router.add("GET", "/drawing-revisions/:id/preview", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const { drawing, revision } = mustFindRevision(store, request.params.id);
    if (!canAccessDrawing(user, store, drawing)) throw notFound("Drawing revision not found");
    return storage.createPreviewTarget(revision.coverPreviewKey);
  });

  router.add("PATCH", "/drawing-revisions/:id/current", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    mapForbidden(() => requireAdmin(user));
    const { drawing, revision } = mustFindRevision(store, request.params.id);
    drawing.revisions.forEach((candidate) => (candidate.isCurrent = candidate.id === revision.id));
    writeAudit(store, user.id, "set_current", "DrawingRevision", revision.id);
    return revision;
  });

  router.add("GET", "/site-items", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const search = request.query.get("search")?.toLowerCase();
    const status = request.query.get("status");
    const now = Date.now();
    return visibleItems(user, store)
      .filter((item) => !status || item.status === status)
      .filter((item) => !request.query.get("type") || item.type === request.query.get("type"))
      .filter((item) => !request.query.get("severity") || item.severity === request.query.get("severity"))
      .filter((item) => !request.query.get("sectionId") || item.sectionId === request.query.get("sectionId"))
      .filter((item) => !request.query.get("areaId") || item.areaId === request.query.get("areaId"))
      .filter((item) => !request.query.get("disciplineId") || item.disciplineId === request.query.get("disciplineId"))
      .filter((item) => !request.query.get("organizationId") || item.responsibleOrgId === request.query.get("organizationId"))
      .filter((item) => request.query.get("overdue") !== "true" || (new Date(item.dueAt).getTime() < now && item.status !== "closed" && item.status !== "voided"))
      .filter((item) => !search || `${item.itemNo} ${item.title} ${item.description}`.toLowerCase().includes(search));
  });

  router.add("GET", "/site-items/:id", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const item = mustFind(store.siteItems, request.params.id, "SiteItem");
    if (!canAccessItem(user, item)) throw notFound("Site item not found");
    return itemDetail(store, user, item);
  });

  router.add("POST", "/site-items", async (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    if (user.role !== "admin" && user.role !== "supervisor") throw forbidden();
    return withIdempotency(store, config, request, user.id, () => {
      return withStoreTransaction(store, () => {
      const body = assertRecord(request.body);
      const sectionId = readString(body, "sectionId") ?? "";
      if (!canAccessSection(user, sectionId)) throw forbidden();
      const item: SiteItem = {
        id: newId("item"),
        projectId: store.project.id,
        sectionId,
        itemNo: `ITEM-2026-${String(store.siteItems.length + 1).padStart(4, "0")}`,
        type: (readString(body, "type") as SiteItem["type"]) ?? "defect",
        status: "pending_approval",
        severity: (readString(body, "severity") as SiteItem["severity"]) ?? "normal",
        title: readString(body, "title") ?? "未命名事项",
        description: readString(body, "description", false) ?? "",
        areaId: readString(body, "areaId") ?? "",
        disciplineId: readString(body, "disciplineId") ?? "",
        locationText: readString(body, "locationText", false) ?? "",
        responsibleOrgId: readString(body, "responsibleOrgId", false),
        responsibleUserId: readString(body, "responsibleUserId", false),
        createdBy: user.id,
        ownerUserId: user.id,
        defaultDueAt: defaultDueAt(readString(body, "severity", false) as SiteItem["severity"] | undefined),
        dueAt: readString(body, "dueAt", false) ?? defaultDueAt(readString(body, "severity", false) as SiteItem["severity"] | undefined),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (item.responsibleOrgId || item.responsibleUserId) {
        const assignment = validateResponsibleAssignment(store, item, item.responsibleOrgId ?? "", item.responsibleUserId);
        item.responsibleOrgId = assignment.responsibleOrgId;
        item.responsibleUserId = assignment.responsibleUserId;
      }
      store.siteItems.unshift(item);
      bindPhotos(store, user, item, readStringArray(body, "photoIds"), "discovery");
      writeWorkflow(store, item, "create", undefined, "pending_approval", user.id, "提交待审核事项");
      writeAudit(store, user.id, "create", "SiteItem", item.id);
      return { body: itemDetail(store, user, item) };
      });
    });
  });

  router.add("PATCH", "/site-items/:id", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const item = mustFind(store.siteItems, request.params.id, "SiteItem");
    if (!canWorkflowOwner(user, item) || item.status === "closed" || item.status === "voided") throw forbidden();
    const changes = pickSiteItemEdits(assertRecord(request.body));
    if (changes.sectionId && !canAccessSection(user, changes.sectionId)) throw forbidden();
    Object.assign(item, changes, { updatedAt: new Date().toISOString() });
    writeAudit(store, user.id, "update", "SiteItem", item.id);
    return itemDetail(store, user, item);
  });

  registerWorkflowRoutes(router, store, config);
  registerPhotoRoutes(router, store, config, storage);
  registerNotificationRoutes(router, store, config);

  router.add("GET", "/audit/logs", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    mapForbidden(() => requireAdmin(user));
    const resourceType = request.query.get("resourceType");
    const action = request.query.get("action");
    return store.auditLogs
      .filter((log) => !resourceType || log.resourceType === resourceType)
      .filter((log) => !action || log.action === action);
  });

  return router;
}

function registerMasterData<T extends MutableMaster>(router: Router, store: Store, config: ApiConfig, name: string, collection: T[]): void {
  router.add("GET", `/master-data/${name}`, (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const includeInactive = request.query.get("includeInactive") === "true" && user.role === "admin";
    return filterMasterDataForUser(name, collection, store, user).filter((record) => includeInactive || record.isActive);
  });

  router.add("POST", `/master-data/${name}`, (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    mapForbidden(() => requireAdmin(user));
    const body = assertRecord(request.body);
    const record = {
      id: newId(name.slice(0, -1)),
      projectId: store.project.id,
      name: readString(body, "name") ?? "",
      code: readString(body, "code") ?? "",
      isActive: true,
      ...pickDefined(body)
    } as T;
    collection.push(record);
    writeAudit(store, user.id, "create", name, record.id);
    return record;
  });

  router.add("PATCH", `/master-data/${name}/:id`, (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    mapForbidden(() => requireAdmin(user));
    const record = mustFind(collection, request.params.id, name);
    Object.assign(record, pickDefined(assertRecord(request.body)));
    writeAudit(store, user.id, "update", name, record.id);
    return record;
  });
}

function registerWorkflowRoutes(router: Router, store: Store, config: ApiConfig): void {
  router.add("POST", "/site-items/:id/dispatch", (request) => workflow(request, store, config, "dispatch"));
  router.add("POST", "/site-items/:id/assign-rectifier", (request) => workflow(request, store, config, "assign_rectifier"));
  router.add("POST", "/site-items/:id/start-rectify", (request) => workflow(request, store, config, "start_rectify"));
  router.add("POST", "/site-items/:id/submit-review", (request) => workflow(request, store, config, "submit_review"));
  router.add("POST", "/site-items/:id/close", (request) => workflow(request, store, config, "close"));
  router.add("POST", "/site-items/:id/void", (request) => workflow(request, store, config, "void"));
  router.add("POST", "/site-items/:id/reopen", (request) => workflow(request, store, config, "reopen"));
  router.add("POST", "/site-items/:id/comments", (request) => workflow(request, store, config, "comment"));
}

async function workflow(request: Parameters<Router["add"]>[2] extends (request: infer R) => unknown ? R : never, store: Store, config: ApiConfig, action: WorkflowAction) {
  authenticate(request, store, config);
  const { user } = requireContext(request);
  return withIdempotency(store, config, request, user.id, () => {
    return withStoreTransaction(store, () => {
      const body = assertRecord(request.body ?? {});
      const item = mustFind(store.siteItems, request.params.id, "SiteItem");
      if (!canAccessItem(user, item)) throw notFound("Site item not found");
      const fromStatus = item.status;
      let toStatus: SiteItemStatus = item.status;
      const comment = readString(body, "comment", false) ?? "";

    if (action === "dispatch") {
      if (!canWorkflowOwner(user, item) || item.status !== "pending_approval") throw forbidden();
      const assignment = validateResponsibleAssignment(
        store,
        item,
        readString(body, "responsibleOrgId") ?? "",
        readString(body, "responsibleUserId", false)
      );
      item.responsibleOrgId = assignment.responsibleOrgId;
      item.responsibleUserId = assignment.responsibleUserId;
      toStatus = "dispatched";
      notify(store, item.responsibleUserId, item, "assigned", "新整改任务", item.title);
    } else if (action === "assign_rectifier") {
      if (!canAssignRectifier(user, item) || item.status === "closed" || item.status === "voided") throw forbidden();
      const assignment = validateResponsibleAssignment(store, item, item.responsibleOrgId ?? "", readString(body, "responsibleUserId") ?? "");
      item.responsibleUserId = assignment.responsibleUserId;
      notify(store, assignment.responsibleUserId, item, "assigned", "整改任务已分配", item.title);
    } else if (action === "start_rectify") {
      if (item.status !== "dispatched" || item.responsibleUserId !== user.id) throw forbidden();
      toStatus = "rectifying";
    } else if (action === "submit_review") {
      if (item.status !== "rectifying" || item.responsibleUserId !== user.id) throw forbidden();
      bindPhotos(store, user, item, readStringArray(body, "photoIds"), "rectification");
      item.submittedForReviewAt = new Date().toISOString();
      toStatus = "pending_acceptance";
      notify(store, item.ownerUserId, item, "review_requested", "待复验事项", item.title);
    } else if (action === "close") {
      if (!canWorkflowOwner(user, item) || item.status !== "pending_acceptance") throw forbidden();
      bindPhotos(store, user, item, readStringArray(body, "photoIds"), "review");
      item.closedAt = new Date().toISOString();
      toStatus = "closed";
    } else if (action === "void") {
      if (!canWorkflowOwner(user, item) || item.status === "closed") throw forbidden();
      item.voidedAt = new Date().toISOString();
      toStatus = "voided";
      notify(store, item.responsibleUserId, item, "voided", "事项已作废", item.title);
    } else if (action === "reopen") {
      if (!canWorkflowOwner(user, item) || (item.status !== "closed" && item.status !== "voided")) throw forbidden();
      item.reopenedAt = new Date().toISOString();
      toStatus = item.responsibleUserId ? "rectifying" : item.responsibleOrgId ? "dispatched" : "pending_approval";
      notify(store, item.responsibleUserId, item, "reopened", "事项已重开", item.title);
    } else if (action === "comment") {
      if (!comment) throw badRequest("comment is required");
    }

      item.status = toStatus;
      item.updatedAt = new Date().toISOString();
      writeWorkflow(store, item, action, fromStatus, toStatus, user.id, comment);
      writeAudit(store, user.id, action, "SiteItem", item.id);
      return { body: itemDetail(store, user, item) };
    });
  });
}

function registerPhotoRoutes(router: Router, store: Store, config: ApiConfig, storage: ObjectStorageClient): void {
  router.add("POST", "/photos/presign", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const body = assertRecord(request.body);
    const fileName = readString(body, "fileName") ?? "";
    const mimeType = readString(body, "mimeType") ?? "";
    const sizeBytes = Number(body.sizeBytes ?? 0);
    if (!mimeType.startsWith("image/")) throw badRequest("Unsupported MIME type");
    if (sizeBytes > config.uploadMaxBytes) throw badRequest("File is too large");
    return storage.createUploadTarget({ actorId: user.id, fileName, mimeType, sizeBytes });
  });

  router.add("POST", "/photos/complete", async (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    return withIdempotency(store, config, request, user.id, () => {
      const body = assertRecord(request.body);
      const objectKey = readString(body, "objectKey") ?? "";
      if (!objectKey.startsWith(`uploads/${user.id}/`)) throw badRequest("objectKey does not belong to current user");
      const photo: PhotoAttachment = {
        id: newId("photo"),
        objectKey,
        thumbnailKey: objectKey,
        fileName: readString(body, "fileName") ?? objectKey.split("/").at(-1) ?? "photo.jpg",
        mimeType: readString(body, "mimeType", false) ?? "image/jpeg",
        sizeBytes: Number(body.sizeBytes ?? 0),
        uploadedBy: user.id,
        uploadedAt: new Date().toISOString()
      };
      store.photos.unshift(photo);
      return { body: photo };
    });
  });

  router.add("GET", "/photos", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const unboundOnly = request.query.get("unboundOnly") === "true";
    const search = request.query.get("search")?.toLowerCase();
    return store.photos
      .filter((photo) => !photo.deletedAt)
      .filter((photo) => user.role === "admin" || photo.uploadedBy === user.id || Boolean(photo.siteItemId && visibleItems(user, store).some((item) => item.id === photo.siteItemId)))
      .filter((photo) => !unboundOnly || !photo.siteItemId)
      .filter((photo) => !search || photo.fileName.toLowerCase().includes(search));
  });

  router.add("GET", "/photos/:id/preview", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const photo = mustFind(store.photos, request.params.id, "Photo");
    if (photo.deletedAt) throw notFound("Photo not found");
    if (photo.uploadedBy !== user.id && !visibleItems(user, store).some((item) => item.id === photo.siteItemId)) throw notFound("Photo not found");
    return storage.createPreviewTarget(photo.objectKey);
  });

  router.add("DELETE", "/photos/:id", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const photo = mustFind(store.photos, request.params.id, "Photo");
    if (photo.uploadedBy !== user.id && user.role !== "admin") throw forbidden();
    photo.deletedAt = new Date().toISOString();
    writeAudit(store, user.id, "delete", "PhotoAttachment", photo.id);
    return photo;
  });
}

function registerNotificationRoutes(router: Router, store: Store, config: ApiConfig): void {
  router.add("GET", "/notifications", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    return store.notifications.filter((notice) => notice.recipientId === user.id);
  });
  router.add("GET", "/notifications/unread-count", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    return { count: store.notifications.filter((notice) => notice.recipientId === user.id && !notice.readAt).length };
  });
  router.add("POST", "/notifications/:id/read", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const notice = mustFind(store.notifications, request.params.id, "Notification");
    if (notice.recipientId !== user.id) throw forbidden();
    notice.readAt = new Date().toISOString();
    return notice;
  });
  router.add("POST", "/notifications/read-all", (request) => {
    authenticate(request, store, config);
    const { user } = requireContext(request);
    const now = new Date().toISOString();
    store.notifications.filter((notice) => notice.recipientId === user.id).forEach((notice) => (notice.readAt = now));
    return { ok: true };
  });
}

function itemDetail(store: Store, user: User, item: SiteItem) {
  return {
    ...item,
    photos: {
      discovery: store.photos.filter((photo) => photo.siteItemId === item.id && photo.stage === "discovery" && !photo.deletedAt),
      rectification: store.photos.filter((photo) => photo.siteItemId === item.id && photo.stage === "rectification" && !photo.deletedAt),
      review: store.photos.filter((photo) => photo.siteItemId === item.id && photo.stage === "review" && !photo.deletedAt)
    },
    workflowLogs: store.workflowLogs.filter((log) => log.siteItemId === item.id),
    allowedActions: allowedActions(user, item)
  };
}

function allowedActions(user: User, item: SiteItem): WorkflowAction[] {
  return allowedWorkflowActions(user, item);
}

function bindPhotos(store: Store, user: User, item: SiteItem, photoIds: string[], stage: PhotoAttachment["stage"]): void {
  for (const photoId of photoIds) {
    const photo = mustFind(store.photos, photoId, "Photo");
    if (photo.uploadedBy !== user.id || photo.siteItemId) throw badRequest("Photo cannot be bound");
    photo.siteItemId = item.id;
    photo.stage = stage;
    photo.sectionSnapshot = store.sections.find((section) => section.id === item.sectionId)?.name;
    photo.areaSnapshot = store.areas.find((area) => area.id === item.areaId)?.name;
    photo.disciplineSnapshot = store.disciplines.find((discipline) => discipline.id === item.disciplineId)?.name;
    photo.responsibleOrgSnapshot = store.organizations.find((org) => org.id === item.responsibleOrgId)?.name;
  }
}

function writeWorkflow(
  store: Store,
  item: SiteItem,
  action: WorkflowAction,
  fromStatus: SiteItemStatus | undefined,
  toStatus: SiteItemStatus | undefined,
  actorId: string,
  comment: string
): void {
  store.workflowLogs.unshift({
    id: newId("log"),
    siteItemId: item.id,
    action,
    fromStatus,
    toStatus,
    actorId,
    comment,
    createdAt: new Date().toISOString()
  });
}

function notify(store: Store, recipientId: string | undefined, item: SiteItem, type: "assigned" | "review_requested" | "voided" | "reopened", title: string, content: string): void {
  if (!recipientId) return;
  store.notifications.unshift({
    id: newId("notice"),
    recipientId,
    siteItemId: item.id,
    type,
    title,
    content,
    createdAt: new Date().toISOString()
  });
}

function mustFind<T extends { id: string }>(collection: T[], id: string, name: string): T {
  const found = collection.find((record) => record.id === id);
  if (!found) throw notFound(`${name} not found`);
  return found;
}

function mustFindRevision(store: Store, id: string): { drawing: Drawing; revision: DrawingRevision } {
  for (const drawing of store.drawings) {
    const revision = drawing.revisions.find((candidate) => candidate.id === id);
    if (revision) return { drawing, revision };
  }
  throw notFound("Drawing revision not found");
}

function validateUser(store: Store, user: User): void {
  if (!["admin", "supervisor", "contractor_manager", "rectifier"].includes(user.role)) throw badRequest("role is invalid");
  if (!store.organizations.some((org) => org.id === user.organizationId && org.isActive)) throw badRequest("organizationId is invalid");
  if (!user.sectionScopeIds.every((sectionId) => store.sections.some((section) => section.id === sectionId))) throw badRequest("sectionScopeIds include invalid section");
  if (store.users.some((candidate) => candidate.id !== user.id && candidate.username === user.username)) throw badRequest("username already exists");
  if (store.users.some((candidate) => candidate.id !== user.id && candidate.phone === user.phone)) throw badRequest("phone already exists");
  if ((user.role === "contractor_manager" || user.role === "rectifier") && store.organizations.find((org) => org.id === user.organizationId)?.type !== "contractor") {
    throw badRequest("Contractor users require a contractor organization");
  }
}

function validateResponsibleAssignment(
  store: Store,
  item: SiteItem,
  responsibleOrgId: string,
  responsibleUserId?: string
): { responsibleOrgId: string; responsibleUserId?: string } {
  const organization = store.organizations.find((org) => org.id === responsibleOrgId && org.isActive);
  if (!organization || organization.type !== "contractor") throw badRequest("responsibleOrgId must be an active contractor organization");
  if (!responsibleUserId) return { responsibleOrgId };

  const rectifier = store.users.find((candidate) => candidate.id === responsibleUserId && candidate.isActive);
  if (!rectifier || rectifier.role !== "rectifier") throw badRequest("responsibleUserId must be an active rectifier");
  if (rectifier.organizationId !== responsibleOrgId) throw badRequest("responsibleUserId must belong to responsibleOrgId");
  if (!canAccessSection(rectifier, item.sectionId)) throw badRequest("responsibleUserId is outside the item section scope");
  return { responsibleOrgId, responsibleUserId };
}

function canAccessDrawing(user: User, store: Store, drawing: Drawing): boolean {
  if (user.role === "admin") return true;
  return visibleItems(user, store).some(
    (item) => item.areaId === drawing.areaId && (!drawing.disciplineId || item.disciplineId === drawing.disciplineId)
  );
}

function filterMasterDataForUser<T extends MutableMaster>(name: string, collection: T[], store: Store, user: User): T[] {
  if (user.role === "admin") return collection;
  if (name === "sections") {
    return collection.filter((record) => canAccessSection(user, record.id));
  }
  if (name === "organizations") {
    if (user.role === "supervisor") return collection;
    return collection.filter((record) => record.id === user.organizationId);
  }
  if (name === "areas") {
    const visibleAreaIds = new Set(visibleItems(user, store).map((item) => item.areaId));
    return collection.filter((record) => visibleAreaIds.size === 0 || visibleAreaIds.has(record.id));
  }
  if (name === "disciplines") {
    const visibleDisciplineIds = new Set(visibleItems(user, store).map((item) => item.disciplineId));
    return collection.filter((record) => visibleDisciplineIds.size === 0 || visibleDisciplineIds.has(record.id));
  }
  return collection;
}

function pickSiteItemEdits(body: Record<string, unknown>): Partial<SiteItem> {
  const allowed: Array<keyof SiteItem> = ["type", "severity", "title", "description", "sectionId", "areaId", "disciplineId", "locationText", "dueAt"];
  const edits: Partial<SiteItem> = {};
  for (const key of allowed) {
    const value = body[key];
    if (typeof value === "string") {
      (edits as Record<string, string>)[key] = value;
    }
  }
  return edits;
}

function defaultDueAt(severity: SiteItem["severity"] = "normal"): string {
  const hours = severity === "severe" ? 24 : severity === "important" ? 72 : 120;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function parseOptionalBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function pickDefined<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function redact(value: string): string {
  return value.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}
