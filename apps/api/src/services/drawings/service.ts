import { badRequest, forbidden, notFound } from "../../errors.js";
import { mapDrawingWithCurrentRevision } from "../../mappers/publicPayloads.js";
import type { Drawing, DrawingRevision, DrawingRevisionPage, User } from "../../types.js";
import { DrawingsRepository } from "../../repositories/drawings/index.js";
import type {
  CreateDrawingInput,
  CreateDrawingRevisionInput,
  DrawingListFilters,
  UpdateDrawingInput
} from "../../repositories/drawings/index.js";
import type { AuditRepository } from "../../repositories/audit/index.js";

export class DrawingsService {
  constructor(
    private readonly repository: DrawingsRepository,
    private readonly auditRepository: AuditRepository
  ) {}

  async list(viewer: User, filters: DrawingListFilters = {}) {
    const drawings = await this.repository.list(filters);
    const visible = await filterVisibleDrawings(this.repository, viewer, drawings);
    return visible.map(mapDrawingWithCurrentRevision);
  }

  async listRevisions(viewer: User, drawingId: string): Promise<DrawingRevision[]> {
    const drawing = await this.requireVisibleDrawing(viewer, drawingId);
    return this.repository.listRevisions(drawing.id);
  }

  async listPages(viewer: User, revisionId: string): Promise<DrawingRevisionPage[]> {
    const found = await this.requireVisibleRevision(viewer, revisionId);
    return found.revision.pages.length > 0 ? found.revision.pages : this.repository.listPages(revisionId);
  }

  async previewKey(viewer: User, revisionId: string): Promise<string> {
    const found = await this.requireVisibleRevision(viewer, revisionId);
    return found.revision.coverPreviewKey;
  }

  async createDrawing(viewer: User, input: Omit<CreateDrawingInput, "projectId"> & { projectId?: string }): Promise<Drawing> {
    requireAdmin(viewer);
    validateDrawingInput(input);
    const projectId = input.projectId ?? (await this.repository.findDefaultProjectId());
    if (!projectId) throw badRequest("project is not initialized");
    return this.repository.transaction(async (context) => {
      const repository = new DrawingsRepository(context);
      const auditRepository = this.auditRepository.withContext(context);
      const created = await repository.createDrawing({
        ...input,
        projectId
      });
      await auditRepository.create({
        actorId: viewer.id,
        action: "create",
        resourceType: "Drawing",
        resourceId: created.id
      });
      return created;
    });
  }

  async updateDrawing(viewer: User, drawingId: string, input: UpdateDrawingInput): Promise<Drawing> {
    requireAdmin(viewer);
    validateDrawingInput(input, true);
    return this.repository.transaction(async (context) => {
      const repository = new DrawingsRepository(context);
      const auditRepository = this.auditRepository.withContext(context);
      const updated = await repository.updateDrawing(drawingId, input);
      if (!updated) throw notFound("Drawing not found");
      await auditRepository.create({
        actorId: viewer.id,
        action: "update",
        resourceType: "Drawing",
        resourceId: drawingId
      });
      return updated;
    });
  }

  async createRevision(viewer: User, input: Omit<CreateDrawingRevisionInput, "uploadedBy">): Promise<DrawingRevision> {
    requireAdmin(viewer);
    if (!input.drawingId || !input.revisionNo || !input.fileKey) throw badRequest("drawingId, revisionNo and fileKey are required");
    if (!Number.isInteger(input.pageCount) || input.pageCount < 1) throw badRequest("pageCount must be greater than 0");
    return this.repository.transaction(async (context) => {
      const repository = new DrawingsRepository(context);
      const auditRepository = this.auditRepository.withContext(context);
      const revision = await repository.createRevision({
        ...input,
        uploadedBy: viewer.id,
        coverPreviewKey: input.coverPreviewKey || `${input.fileKey}-p1`
      });
      await auditRepository.create({
        actorId: viewer.id,
        action: "upload_revision",
        resourceType: "DrawingRevision",
        resourceId: revision.id
      });
      return revision;
    });
  }

  async setCurrentRevision(viewer: User, revisionId: string): Promise<DrawingRevision> {
    requireAdmin(viewer);
    return this.repository.transaction(async (context) => {
      const repository = new DrawingsRepository(context);
      const auditRepository = this.auditRepository.withContext(context);
      const revision = await repository.setCurrentRevision(revisionId);
      if (!revision) throw notFound("Drawing revision not found");
      await auditRepository.create({
        actorId: viewer.id,
        action: "set_current",
        resourceType: "DrawingRevision",
        resourceId: revisionId
      });
      return revision;
    });
  }

  private async requireVisibleDrawing(viewer: User, drawingId: string): Promise<Drawing> {
    const drawing = await this.repository.findById(drawingId);
    if (!drawing || !(await canAccessDrawing(this.repository, viewer, drawing))) {
      throw notFound("Drawing not found");
    }
    return drawing;
  }

  private async requireVisibleRevision(viewer: User, revisionId: string): Promise<{ drawing: Drawing; revision: DrawingRevision }> {
    const found = await this.repository.findRevision(revisionId);
    if (!found || !(await canAccessDrawing(this.repository, viewer, found.drawing))) {
      throw notFound("Drawing revision not found");
    }
    return found;
  }
}

function requireAdmin(user: User): void {
  if (user.role !== "admin") throw forbidden();
}

interface DrawingValidationInput {
  areaId?: string;
  name?: string;
  code?: string;
  disciplineId?: string | null;
}

function validateDrawingInput(input: DrawingValidationInput, partial = false): void {
  if (!partial && (!input.areaId || !input.name || !input.code)) throw badRequest("areaId, name and code are required");
  if (input.name !== undefined && !input.name.trim()) throw badRequest("name is required");
  if (input.code !== undefined && !input.code.trim()) throw badRequest("code is required");
  if (input.areaId !== undefined && !input.areaId.trim()) throw badRequest("areaId is required");
}

async function filterVisibleDrawings(repository: DrawingsRepository, viewer: User, drawings: Drawing[]): Promise<Drawing[]> {
  const visible: Drawing[] = [];
  for (const drawing of drawings) {
    if (await canAccessDrawing(repository, viewer, drawing)) {
      visible.push(drawing);
    }
  }
  return visible;
}

async function canAccessDrawing(repository: DrawingsRepository, viewer: User, drawing: Drawing): Promise<boolean> {
  if (viewer.role === "admin") return true;
  return repository.hasVisibleItemForDrawing(viewer, drawing);
}
