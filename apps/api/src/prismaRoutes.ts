import type { PrismaClient } from "@prisma/client";
import type { ApiConfig } from "./config.js";
import { badRequest, forbidden, notFound, unauthorized } from "./errors.js";
import { assertRecord, readString, readStringArray, Router } from "./http.js";
import { hashPassword, stableHash, verifyTokenPayload } from "./security.js";
import { ObjectStorageClient, decodeObjectKey } from "./storage.js";
import { AuditRepository } from "./repositories/audit/index.js";
import { AuthRepository } from "./repositories/auth/index.js";
import { DrawingsRepository } from "./repositories/drawings/index.js";
import { IdempotencyRepository } from "./repositories/idempotency/index.js";
import { MasterDataRepository } from "./repositories/master-data/index.js";
import { NotificationsRepository } from "./repositories/notifications/index.js";
import { PhotosRepository } from "./repositories/photos/index.js";
import { SiteItemsRepository } from "./repositories/site-items/index.js";
import { SystemSettingsRepository } from "./repositories/system-settings/index.js";
import { ExportJobsRepository } from "./repositories/export-jobs/index.js";
import { ImportJobsRepository } from "./repositories/import-jobs/index.js";
import { UsersRepository } from "./repositories/users/index.js";
import { AuditService } from "./services/audit/index.js";
import { AuthService } from "./services/auth/index.js";
import { DrawingsService } from "./services/drawings/index.js";
import { IdempotencyService } from "./services/idempotency/index.js";
import { MasterDataService, type MasterDataKind } from "./services/master-data/index.js";
import { NotificationsService } from "./services/notifications/index.js";
import { PhotosService } from "./services/photos/index.js";
import { SiteItemsService } from "./services/site-items/index.js";
import { SystemSettingsService, type SystemSettingsUpdateInput } from "./services/system-settings/index.js";
import { UsersService } from "./services/users/index.js";
import {
  buildAuditExport,
  buildCloseoutPdfExport,
  buildPhotoPackageExport,
  buildSiteItemLedgerExport,
  canCreateSiteItemLedgerExport,
  validateImportCsv,
  type GeneratedExportArtifact,
  type NormalizedImportRow,
  readGeneratedExportArtifact
} from "./services/import-export/index.js";
import type { ExportJob, ImportJob, ImportKind, Role, Severity, SiteItem, SiteItemStatus, SiteItemType, User, WorkflowAction } from "./types.js";

export function buildPrismaRouter(prisma: PrismaClient, config: ApiConfig): Router {
  const router = new Router();
  const context = { prisma };

  const auditRepository = new AuditRepository(context);
  const systemSettingsRepository = new SystemSettingsRepository(context);
  const systemSettingsService = new SystemSettingsService(systemSettingsRepository, config, auditRepository);
  const storage = new ObjectStorageClient(config, () => systemSettingsService.objectStorageConfig());
  const authRepository = new AuthRepository(context);
  const idempotencyRepository = new IdempotencyRepository(context);
  const notificationsRepository = new NotificationsRepository(context);
  const siteItemsRepository = new SiteItemsRepository(context);
  const exportJobsRepository = new ExportJobsRepository(context);
  const importJobsRepository = new ImportJobsRepository(context);
  const masterDataRepository = new MasterDataRepository(context);
  const usersRepository = new UsersRepository(context);

  const authService = new AuthService(authRepository, config, auditRepository, usersRepository);
  const idempotencyService = new IdempotencyService(idempotencyRepository, config);
  const usersService = new UsersService(usersRepository, auditRepository, idempotencyService);
  const masterDataService = new MasterDataService(masterDataRepository, auditRepository);
  const drawingsService = new DrawingsService(new DrawingsRepository(context), auditRepository);
  const siteItemsService = new SiteItemsService(siteItemsRepository, auditRepository, idempotencyService, notificationsRepository);
  const photosService = new PhotosService(new PhotosRepository(context), storage, config, idempotencyService, auditRepository, systemSettingsService);
  const notificationsService = new NotificationsService(notificationsRepository);
  const auditService = new AuditService(auditRepository);

  async function viewer(request: Parameters<Router["add"]>[2] extends (request: infer R) => unknown ? R : never): Promise<User> {
    const header = request.headers.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw?.startsWith("Bearer ")) throw unauthorized();
    const payload = verifyTokenPayload(raw.slice("Bearer ".length), config);
    const user = await authRepository.findActiveUserById(payload.sub);
    if (!user) throw unauthorized();
    if (payload.pwd !== stableHash(user.passwordHash)) throw unauthorized();
    return user;
  }

  router.add("GET", "/health", () => ({
    service: "@site-management/api",
    status: "ok",
    time: new Date().toISOString()
  }));

  router.add("GET", "/ready", async () => {
    const objectStorage = await systemSettingsService.objectStorageConfig();
    return {
    status: "ok",
    dependencies: {
      postgresql: { status: "configured", url: redact(config.databaseUrl) },
      redis: { status: "configured", url: config.redisUrl },
      objectStorage: { status: "configured", endpoint: objectStorage.endpoint, bucket: objectStorage.bucket }
    }
  };
  });

  router.add("POST", "/auth/login", (request) => {
    const body = assertRecord(request.body);
    const account = readString(body, "username", false) ?? readString(body, "phone", false);
    const password = readString(body, "password");
    if (!account || !password) throw badRequest("username or phone is required");
    return authService.login(account, password);
  });

  router.add("POST", "/auth/logout", async (request) => authService.logout(await viewer(request)));
  router.add("GET", "/auth/me", async (request) => ({ user: await authService.currentUser((await viewer(request)).id) }));
  router.add("POST", "/auth/change-password", async (request) => {
    const body = assertRecord(request.body);
    return authService.changePassword(await viewer(request), readString(body, "currentPassword", false), readString(body, "newPassword", false));
  });

  router.add("GET", "/settings", async (request) => systemSettingsService.view(await viewer(request)));
  router.add("PATCH", "/settings", async (request) => systemSettingsService.update(await viewer(request), readSystemSettingsUpdate(assertRecord(request.body))));

  router.add("GET", "/users", async (request) => {
    const actor = await viewer(request);
    if (actor.role !== "admin") throw forbidden();
    return usersService.list({
      search: queryString(request, "search"),
      role: queryString(request, "role") as Role | undefined,
      active: parseOptionalBoolean(request.query.get("active"))
    });
  });
  router.add("GET", "/users/visible", async (request) => {
    const actor = await viewer(request);
    return usersService.listVisible(actor, {
      search: queryString(request, "search"),
      role: queryString(request, "role") as Role | undefined,
      active: parseOptionalBoolean(request.query.get("active"))
    });
  });
  router.add("POST", "/users", async (request) => {
    const body = assertRecord(request.body);
    return usersService.create(await viewer(request), {
      organizationId: readString(body, "organizationId") ?? "",
      name: readString(body, "name") ?? "",
      phone: readString(body, "phone") ?? "",
      username: readString(body, "username") ?? "",
      role: (readString(body, "role") as Role | undefined) ?? "rectifier",
      password: readString(body, "password", false),
      sectionScopeIds: readStringArray(body, "sectionScopeIds")
    }, idempotencyRequest(request));
  });
  router.add("PATCH", "/users/:id", async (request) => usersService.update(await viewer(request), request.params.id, pickDefined(assertRecord(request.body))));
  router.add("PATCH", "/users/:id/disable", async (request) => usersService.disable(await viewer(request), request.params.id));
  router.add("POST", "/users/:id/reset-password", async (request) => {
    const body = request.body ? assertRecord(request.body) : {};
    return usersService.resetPassword(await viewer(request), request.params.id, readString(body, "password", false));
  });

  registerMasterData(router, viewer, masterDataService, "sections");
  registerMasterData(router, viewer, masterDataService, "organizations");
  registerMasterData(router, viewer, masterDataService, "areas");
  registerMasterData(router, viewer, masterDataService, "disciplines");

  router.add("GET", "/drawings", async (request) =>
    drawingsService.list(await viewer(request), {
      areaId: queryString(request, "areaId"),
      disciplineId: queryString(request, "disciplineId"),
      search: queryString(request, "search")
    })
  );
  router.add("POST", "/drawings", async (request) => {
    const body = assertRecord(request.body);
    return drawingsService.createDrawing(await viewer(request), {
      areaId: readString(body, "areaId") ?? "",
      disciplineId: readString(body, "disciplineId", false),
      name: readString(body, "name") ?? "",
      code: readString(body, "code") ?? ""
    });
  });
  router.add("PATCH", "/drawings/:id", async (request) => drawingsService.updateDrawing(await viewer(request), request.params.id, pickDefined(assertRecord(request.body))));
  router.add("POST", "/drawings/:id/revisions", async (request) => {
    const body = assertRecord(request.body);
    return drawingsService.createRevision(await viewer(request), {
      drawingId: request.params.id,
      revisionNo: readString(body, "revisionNo") ?? "",
      fileKey: readString(body, "fileKey") ?? "",
      coverPreviewKey: readString(body, "coverPreviewKey", false),
      pageCount: Number(body.pageCount ?? 1),
      isCurrent: Boolean(body.isCurrent)
    });
  });
  router.add("GET", "/drawings/:id/revisions", async (request) => drawingsService.listRevisions(await viewer(request), request.params.id));
  router.add("GET", "/drawing-revisions/:id/pages", async (request) => drawingsService.listPages(await viewer(request), request.params.id));
  router.add("GET", "/drawing-revisions/:id/preview", async (request) => storage.createPreviewTarget(await drawingsService.previewKey(await viewer(request), request.params.id)));
  router.add("PATCH", "/drawing-revisions/:id/current", async (request) => drawingsService.setCurrentRevision(await viewer(request), request.params.id));

  router.add("GET", "/site-items", async (request) =>
    siteItemsService.list(await viewer(request), {
      search: queryString(request, "search"),
      status: queryString(request, "status") as SiteItemStatus | undefined,
      type: queryString(request, "type") as SiteItemType | undefined,
      severity: queryString(request, "severity") as Severity | undefined,
      sectionId: queryString(request, "sectionId"),
      areaId: queryString(request, "areaId"),
      disciplineId: queryString(request, "disciplineId"),
      organizationId: queryString(request, "organizationId"),
      overdue: request.query.get("overdue") === "true"
    })
  );
  router.add("GET", "/site-items/:id", async (request) => siteItemsService.detail(await viewer(request), request.params.id));
  router.add("POST", "/site-items", async (request) =>
    siteItemsService.create(await viewer(request), pickDefined(assertRecord(request.body)), idempotencyRequest(request))
  );
  router.add("PATCH", "/site-items/:id", async (request) =>
    siteItemsService.update(await viewer(request), request.params.id, pickDefined(assertRecord(request.body)), idempotencyRequest(request))
  );
  registerWorkflow(router, viewer, siteItemsService, "dispatch");
  registerWorkflow(router, viewer, siteItemsService, "assign_rectifier", "assign-rectifier");
  registerWorkflow(router, viewer, siteItemsService, "start_rectify", "start-rectify");
  registerWorkflow(router, viewer, siteItemsService, "submit_review", "submit-review");
  registerWorkflow(router, viewer, siteItemsService, "return_rectification", "return-rectification");
  registerWorkflow(router, viewer, siteItemsService, "close");
  registerWorkflow(router, viewer, siteItemsService, "void");
  registerWorkflow(router, viewer, siteItemsService, "reopen");
  registerWorkflow(router, viewer, siteItemsService, "comment", "comments");

  router.add("POST", "/photos/presign", async (request) => photosService.presign(await viewer(request), pickDefined(assertRecord(request.body))));
  router.add("PUT", "/photos/upload/:key", async (request) => {
    const actor = await viewer(request);
    const objectKey = decodeObjectKey(request.params.key);
    if (!objectKey.startsWith(`uploads/${actor.id}/`)) throw badRequest("objectKey does not belong to current user");
    const contentType = Array.isArray(request.headers["content-type"]) ? request.headers["content-type"][0] : request.headers["content-type"] ?? "application/octet-stream";
    await storage.putObject(objectKey, request.rawBuffer, contentType);
    return { objectKey };
  });
  router.add("POST", "/photos/complete", async (request) =>
    photosService.completeUpload(await viewer(request), pickDefined(assertRecord(request.body)), idempotencyRequest(request))
  );
  router.add("GET", "/photos", async (request) =>
    photosService.list(await viewer(request), {
      unboundOnly: request.query.get("unboundOnly") === "true",
      search: queryString(request, "search")
    })
  );
  router.add("GET", "/photos/:id/preview", async (request) => photosService.preview(await viewer(request), request.params.id));
  router.add("DELETE", "/photos/:id", async (request) => photosService.delete(await viewer(request), request.params.id, idempotencyRequest(request)));

  router.add("GET", "/notifications", async (request) => notificationsService.list(await viewer(request)));
  router.add("GET", "/notifications/unread-count", async (request) => notificationsService.unreadCount(await viewer(request)));
  router.add("POST", "/notifications/:id/read", async (request) => notificationsService.markRead(await viewer(request), request.params.id));
  router.add("POST", "/notifications/read-all", async (request) => notificationsService.markAllRead(await viewer(request)));
  router.add("GET", "/audit/logs", async (request) =>
    auditService.list(await viewer(request), {
      resourceType: queryString(request, "resourceType"),
      action: queryString(request, "action")
    })
  );

  router.add("POST", "/imports/:kind", async (request) => {
    const actor = await viewer(request);
    if (actor.role !== "admin") throw forbidden();
    const kind = readImportKind(request.params.kind);
    const body = assertRecord(request.body);
    const csvText = readString(body, "csvText") ?? "";
    const sourceFileName = readString(body, "sourceFileName", false);
    return idempotencyService.run(
      {
        actorId: actor.id,
        method: request.method,
        path: request.path,
        key: idempotencyRequest(request).key,
        requestBody: { kind, csvText, sourceFileName }
      },
      async () => ({
        body: await runPrismaImportJob({
          importJobsRepository,
          masterDataRepository,
          usersRepository,
          auditRepository,
          masterDataService,
          usersService,
          actor,
          kind,
          csvText,
          sourceFileName
        })
      })
    );
  });

  router.add("GET", "/imports/:id", async (request) => {
    const actor = await viewer(request);
    if (actor.role !== "admin") throw forbidden();
    const job = await importJobsRepository.findById(request.params.id);
    if (!job) throw notFound("Import job not found");
    return job;
  });

  router.add("POST", "/exports/site-items", async (request) => {
    const actor = await viewer(request);
    if (!canCreateSiteItemLedgerExport(actor)) throw forbidden();
    const filters = parseSiteItemExportFilters(request.body ? assertRecord(request.body) : {});
    const now = new Date();
    return runPrismaExportJob(exportJobsRepository, auditRepository, actor, "excel", filters, "export_site_items", async () => {
      const items = await siteItemsService.list(actor, filters);
      const details = await Promise.all(items.map((item) => siteItemsRepository.findDetailById(actor, item.id)));
      return buildSiteItemLedgerExport({
        requester: actor,
        items,
        photos: details.flatMap((detail) => detail?.photos ?? []),
        workflowLogs: details.flatMap((detail) => detail?.workflowLogs ?? []),
        sections: await masterDataService.list("sections", actor, true),
        areas: await masterDataService.list("areas", actor, true),
        disciplines: await masterDataService.list("disciplines", actor, true),
        organizations: await masterDataService.list("organizations", actor, true),
        users: await usersService.listVisible(actor, {}),
        generatedAt: now
      });
    });
  });

  router.add("POST", "/exports/photo-package", async (request) => {
    const actor = await viewer(request);
    if (!canCreateSiteItemLedgerExport(actor)) throw forbidden();
    const filters = parseSiteItemExportFilters(request.body ? assertRecord(request.body) : {});
    const now = new Date();
    return runPrismaExportJob(exportJobsRepository, auditRepository, actor, "photo_package", filters, "export_photo_package", async () => {
      const items = await siteItemsService.list(actor, filters);
      const details = await Promise.all(items.map((item) => siteItemsRepository.findDetailById(actor, item.id)));
      return buildPhotoPackageExport({
        requester: actor,
        items,
        photos: details.flatMap((detail) => detail?.photos ?? []),
        users: await usersService.listVisible(actor, {}),
        generatedAt: now
      });
    });
  });

  router.add("POST", "/exports/site-items/:id/pdf", async (request) => {
    const actor = await viewer(request);
    const detail = await siteItemsService.detail(actor, request.params.id);
    const now = new Date();
    return runPrismaExportJob(exportJobsRepository, auditRepository, actor, "pdf", { itemId: detail.id }, "export_closeout_pdf", async () =>
      buildCloseoutPdfExport({
        requester: actor,
        item: detail,
        photos: [...detail.photos.discovery, ...detail.photos.rectification, ...detail.photos.review],
        workflowLogs: detail.workflowLogs,
        generatedAt: now
      })
    );
  });

  router.add("POST", "/exports/audit", async (request) => {
    const actor = await viewer(request);
    if (actor.role !== "admin") throw forbidden();
    const filters = parseAuditExportFilters(request.body ? assertRecord(request.body) : {});
    const now = new Date();
    return runPrismaExportJob(exportJobsRepository, auditRepository, actor, "audit", filters, "export_audit", async () =>
      buildAuditExport({
        requester: actor,
        logs: await auditService.list(actor, filters),
        generatedAt: now
      })
    );
  });

  router.add("GET", "/exports/:id", async (request) => {
    const actor = await viewer(request);
    return mustFindAuthorizedExportJob(await exportJobsRepository.findById(request.params.id), actor);
  });

  router.add("GET", "/exports/:id/download", async (request) => {
    const actor = await viewer(request);
    const job = mustFindAuthorizedExportJob(await exportJobsRepository.findById(request.params.id), actor);
    if (job.status !== "succeeded" || !job.artifactKey || !job.artifactFileName || !job.artifactMimeType) {
      throw badRequest("Export artifact is not ready");
    }
    const artifact = readGeneratedExportArtifact(job.artifactKey);
    if (artifact) {
      return {
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        contentBase64: Buffer.from(artifact.content).toString("base64")
      };
    }
    return {
      fileName: job.artifactFileName,
      mimeType: job.artifactMimeType,
      ...(await storage.createDownloadTarget(job.artifactKey))
    };
  });

  return router;
}

interface RunPrismaImportJobInput {
  importJobsRepository: ImportJobsRepository;
  masterDataRepository: MasterDataRepository;
  usersRepository: UsersRepository;
  auditRepository: AuditRepository;
  masterDataService: MasterDataService;
  usersService: UsersService;
  actor: User;
  kind: ImportKind;
  csvText: string;
  sourceFileName?: string;
}

async function runPrismaImportJob(input: RunPrismaImportJobInput): Promise<ImportJob> {
  let job = await input.importJobsRepository.create({
    kind: input.kind,
    status: "running",
    requestedBy: input.actor.id,
    sourceFileName: input.sourceFileName,
    startedAt: new Date()
  });

  try {
    const [organizations, sections, areas, disciplines, users] = await Promise.all([
      input.masterDataService.list("organizations", input.actor, true),
      input.masterDataService.list("sections", input.actor, true),
      input.masterDataService.list("areas", input.actor, true),
      input.masterDataService.list("disciplines", input.actor, true),
      input.usersService.list()
    ]);
    const result = validateImportCsv(input.kind, input.csvText, { organizations, sections, areas, disciplines, users });
    const projectId = await input.masterDataRepository.findDefaultProjectId();
    if (!projectId) throw badRequest("project is not initialized");
    for (const row of result.accepted) {
      await applyPrismaImportRow(input, projectId, row);
    }
    job = (await input.importJobsRepository.update(job.id, {
      status: "succeeded",
      acceptedRows: result.accepted.length,
      rejectedRows: result.rejectedRows,
      errors: result.errors,
      completedAt: new Date()
    })) as ImportJob;
  } catch (error) {
    job = (await input.importJobsRepository.update(job.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Import failed",
      completedAt: new Date()
    })) as ImportJob;
  }

  return job;
}

async function applyPrismaImportRow(input: RunPrismaImportJobInput, projectId: string, row: NormalizedImportRow): Promise<void> {
  if (row.kind === "organizations") {
    const record = await input.masterDataRepository.createOrganization({ projectId, ...row.data });
    await input.auditRepository.create({ actorId: input.actor.id, action: "import_create", resourceType: "Organization", resourceId: record.id, metadata: { rowNumber: row.rowNumber } });
    return;
  }
  if (row.kind === "sections") {
    const record = await input.masterDataRepository.createSection({ projectId, ...row.data });
    await input.auditRepository.create({ actorId: input.actor.id, action: "import_create", resourceType: "Section", resourceId: record.id, metadata: { rowNumber: row.rowNumber } });
    return;
  }
  if (row.kind === "areas") {
    const record = await input.masterDataRepository.createArea({ projectId, ...row.data });
    await input.auditRepository.create({ actorId: input.actor.id, action: "import_create", resourceType: "Area", resourceId: record.id, metadata: { rowNumber: row.rowNumber } });
    return;
  }
  if (row.kind === "disciplines") {
    const record = await input.masterDataRepository.createDiscipline({ projectId, ...row.data });
    await input.auditRepository.create({ actorId: input.actor.id, action: "import_create", resourceType: "Discipline", resourceId: record.id, metadata: { rowNumber: row.rowNumber } });
    return;
  }
  const record = await input.usersRepository.create({
    projectId,
    organizationId: row.data.organizationId,
    name: row.data.name,
    phone: row.data.phone,
    username: row.data.username,
    role: row.data.role,
    passwordHash: hashPassword(row.data.password),
    sectionScopeIds: row.data.sectionScopeIds,
    isActive: row.data.isActive
  });
  await input.auditRepository.create({ actorId: input.actor.id, action: "import_create", resourceType: "User", resourceId: record.id, metadata: { rowNumber: row.rowNumber } });
}

async function runPrismaExportJob(
  exportJobsRepository: ExportJobsRepository,
  auditRepository: AuditRepository,
  actor: User,
  type: ExportJob["type"],
  params: Record<string, unknown>,
  auditAction: string,
  buildArtifact: (job: ExportJob) => Promise<GeneratedExportArtifact>
): Promise<ExportJob> {
  let job = await exportJobsRepository.create({
    type,
    status: "running",
    requestedBy: actor.id,
    params,
    startedAt: new Date()
  });

  try {
    const artifact = await buildArtifact(job);
    job = (await exportJobsRepository.update(job.id, {
      status: "succeeded",
      artifactKey: artifact.artifactKey,
      artifactFileName: artifact.fileName,
      artifactMimeType: artifact.mimeType,
      completedAt: new Date()
    })) as ExportJob;
    await auditRepository.create({
      actorId: actor.id,
      action: auditAction,
      resourceType: "ExportJob",
      resourceId: job.id
    });
  } catch (error) {
    job = (await exportJobsRepository.update(job.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Export failed",
      completedAt: new Date()
    })) as ExportJob;
  }

  return job;
}

type ViewerResolver = (request: Parameters<Router["add"]>[2] extends (request: infer R) => unknown ? R : never) => Promise<User>;

function registerMasterData(router: Router, viewer: ViewerResolver, service: MasterDataService, kind: MasterDataKind): void {
  router.add("GET", `/master-data/${kind}`, async (request) => listMasterData(service, kind, await viewer(request), request.query.get("includeInactive") === "true"));
  router.add("POST", `/master-data/${kind}`, async (request) => createMasterData(service, kind, await viewer(request), pickDefined(assertRecord(request.body))));
  router.add("PATCH", `/master-data/${kind}/:id`, async (request) => service.update(kind, await viewer(request), request.params.id, pickDefined(assertRecord(request.body))));
}

function registerWorkflow(router: Router, viewer: ViewerResolver, service: SiteItemsService, action: WorkflowAction, path: string = action): void {
  router.add("POST", `/site-items/:id/${path}`, async (request) =>
    service.transition(await viewer(request), request.params.id, action, pickDefined((request.body ? assertRecord(request.body) : {}) as Record<string, unknown>), idempotencyRequest(request))
  );
}

function listMasterData(service: MasterDataService, kind: MasterDataKind, viewer: User, includeInactive: boolean) {
  if (kind === "sections") return service.list("sections", viewer, includeInactive);
  if (kind === "organizations") return service.list("organizations", viewer, includeInactive);
  if (kind === "areas") return service.list("areas", viewer, includeInactive);
  return service.list("disciplines", viewer, includeInactive);
}

function createMasterData(service: MasterDataService, kind: MasterDataKind, viewer: User, input: Record<string, unknown>) {
  const normalized = {
    name: typeof input.name === "string" ? input.name : undefined,
    code: typeof input.code === "string" ? input.code : undefined,
    type: typeof input.type === "string" ? input.type : undefined,
    parentId: typeof input.parentId === "string" ? input.parentId : undefined
  };
  const create = service.create as unknown as (targetKind: MasterDataKind, actor: User, body: typeof normalized) => Promise<unknown>;
  return create.call(service, kind, viewer, normalized);
}

function idempotencyRequest(request: Parameters<Router["add"]>[2] extends (request: infer R) => unknown ? R : never) {
  const header = request.headers["idempotency-key"];
  return {
    method: request.method,
    path: request.path,
    key: Array.isArray(header) ? header[0] : header
  };
}

function mustFindAuthorizedExportJob(job: ExportJob | undefined, actor: User): ExportJob {
  if (!job || (actor.role !== "admin" && job.requestedBy !== actor.id)) throw notFound("Export job not found");
  return job;
}

function parseSiteItemExportFilters(body: Record<string, unknown>) {
  return pickDefined({
    search: typeof body.search === "string" && body.search.trim() ? body.search.trim() : undefined,
    status: readOptionalEnum(body.status, siteItemStatuses, "status"),
    type: readOptionalEnum(body.type, siteItemTypes, "type"),
    severity: readOptionalEnum(body.severity, severities, "severity"),
    sectionId: typeof body.sectionId === "string" && body.sectionId.trim() ? body.sectionId.trim() : undefined,
    areaId: typeof body.areaId === "string" && body.areaId.trim() ? body.areaId.trim() : undefined,
    disciplineId: typeof body.disciplineId === "string" && body.disciplineId.trim() ? body.disciplineId.trim() : undefined,
    organizationId: typeof body.organizationId === "string" && body.organizationId.trim() ? body.organizationId.trim() : undefined,
    overdue: typeof body.overdue === "boolean" ? body.overdue : undefined
  }) as {
    search?: string;
    status?: SiteItemStatus;
    type?: SiteItem["type"];
    severity?: SiteItem["severity"];
    sectionId?: string;
    areaId?: string;
    disciplineId?: string;
    organizationId?: string;
    overdue?: boolean;
  };
}

function parseAuditExportFilters(body: Record<string, unknown>) {
  return pickDefined({
    resourceType: typeof body.resourceType === "string" && body.resourceType.trim() ? body.resourceType.trim() : undefined,
    action: typeof body.action === "string" && body.action.trim() ? body.action.trim() : undefined
  });
}

function readImportKind(value: string): ImportKind {
  if (["organizations", "sections", "areas", "disciplines", "users"].includes(value)) return value as ImportKind;
  throw badRequest("import kind is invalid");
}

function readSystemSettingsUpdate(body: Record<string, unknown>): SystemSettingsUpdateInput {
  const objectStorage = isRecord(body.objectStorage) ? body.objectStorage : undefined;
  const uploads = isRecord(body.uploads) ? body.uploads : undefined;
  const features = isRecord(body.features) ? body.features : undefined;
  return pickDefined({
    objectStorage: objectStorage
      ? pickDefined({
          endpoint: typeof objectStorage.endpoint === "string" ? objectStorage.endpoint : undefined,
          bucket: typeof objectStorage.bucket === "string" ? objectStorage.bucket : undefined,
          accessKey: typeof objectStorage.accessKey === "string" ? objectStorage.accessKey : undefined,
          secretKey: typeof objectStorage.secretKey === "string" ? objectStorage.secretKey : undefined,
          activeProfileId: typeof objectStorage.activeProfileId === "string" ? objectStorage.activeProfileId : undefined,
          profiles: Array.isArray(objectStorage.profiles)
            ? objectStorage.profiles.filter(isRecord).map((profile) =>
                pickDefined({
                  id: typeof profile.id === "string" ? profile.id : undefined,
                  name: typeof profile.name === "string" ? profile.name : undefined,
                  endpoint: typeof profile.endpoint === "string" ? profile.endpoint : undefined,
                  bucket: typeof profile.bucket === "string" ? profile.bucket : undefined,
                  accessKey: typeof profile.accessKey === "string" ? profile.accessKey : undefined,
                  secretKey: typeof profile.secretKey === "string" ? profile.secretKey : undefined,
                  capacityBytes: typeof profile.capacityBytes === "number" ? profile.capacityBytes : undefined
                })
              )
            : undefined
        })
      : undefined,
    uploads: uploads
      ? pickDefined({
          maxBytes: typeof uploads.maxBytes === "number" || typeof uploads.maxBytes === "string" ? Number(uploads.maxBytes) : undefined
        })
      : undefined,
    features: features
      ? pickDefined({
          backupsManagedExternally: typeof features.backupsManagedExternally === "boolean" ? features.backupsManagedExternally : undefined
        })
      : undefined
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const siteItemStatuses = ["pending_approval", "dispatched", "rectifying", "pending_acceptance", "closed", "voided"] as const;
const siteItemTypes = ["defect", "punch"] as const;
const severities = ["normal", "important", "severe"] as const;

function readOptionalEnum<T extends string>(value: unknown, allowed: readonly T[], name: string): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) throw badRequest(`${name} is invalid`);
  return value as T;
}

function queryString(request: Parameters<Router["add"]>[2] extends (request: infer R) => unknown ? R : never, key: string): string | undefined {
  return request.query.get(key) ?? undefined;
}

function parseOptionalBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function pickDefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}

function redact(value: string): string {
  return value.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}
