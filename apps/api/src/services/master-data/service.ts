import { badRequest, forbidden, notFound } from "../../errors.js";
import type { Area, Discipline, Organization, OrganizationType, Section, User } from "../../types.js";
import type {
  CreateAreaInput,
  CreateDisciplineInput,
  CreateOrganizationInput,
  CreateSectionInput,
  MasterDataRecord,
  MasterDataRepository,
  UpdateMasterDataInput
} from "../../repositories/master-data/index.js";
import type { AuditRepository } from "../../repositories/audit/index.js";

export type MasterDataKind = "sections" | "organizations" | "areas" | "disciplines";

export class MasterDataService {
  constructor(
    private readonly repository: MasterDataRepository,
    private readonly auditRepository: AuditRepository
  ) {}

  async list(kind: "sections", viewer: User, includeInactive?: boolean): Promise<Section[]>;
  async list(kind: "organizations", viewer: User, includeInactive?: boolean): Promise<Organization[]>;
  async list(kind: "areas", viewer: User, includeInactive?: boolean): Promise<Area[]>;
  async list(kind: "disciplines", viewer: User, includeInactive?: boolean): Promise<Discipline[]>;
  async list(kind: MasterDataKind, viewer: User, includeInactive = false): Promise<Array<Section | Organization | Area | Discipline>> {
    if (kind === "sections") {
      return this.repository.listSections({
        includeInactive: canIncludeInactive(viewer, includeInactive),
        ids: viewer.role === "admin" ? undefined : viewer.sectionScopeIds
      });
    }

    if (kind === "organizations") {
      return this.repository.listOrganizations({
        includeInactive: canIncludeInactive(viewer, includeInactive),
        ids: viewer.role === "admin" || viewer.role === "supervisor" ? undefined : [viewer.organizationId]
      });
    }

    if (kind === "areas") {
      const visibleAreaIds = viewer.role === "admin" ? [] : await this.repository.visibleAreaIdsForUser(viewer);
      return this.repository.listAreas({
        includeInactive: canIncludeInactive(viewer, includeInactive),
        ids: visibleAreaIds.length > 0 ? visibleAreaIds : undefined
      });
    }

    const visibleDisciplineIds = viewer.role === "admin" ? [] : await this.repository.visibleDisciplineIdsForUser(viewer);
    return this.repository.listDisciplines({
      includeInactive: canIncludeInactive(viewer, includeInactive),
      ids: visibleDisciplineIds.length > 0 ? visibleDisciplineIds : undefined
    });
  }

  async create(kind: "sections", viewer: User, input: Omit<CreateSectionInput, "projectId">): Promise<Section>;
  async create(kind: "organizations", viewer: User, input: Omit<CreateOrganizationInput, "projectId">): Promise<Organization>;
  async create(kind: "areas", viewer: User, input: Omit<CreateAreaInput, "projectId">): Promise<Area>;
  async create(kind: "disciplines", viewer: User, input: Omit<CreateDisciplineInput, "projectId">): Promise<Discipline>;
  async create(kind: MasterDataKind, viewer: User, input: MasterDataCreateInput): Promise<MasterDataRecord> {
    requireAdmin(viewer);
    validateMasterDataInput(kind, input);
    return this.repository.transaction(async (context) => {
      const repository = this.repository.withContext(context);
      const auditRepository = this.auditRepository.withContext(context);
      const projectId = await this.resolveProjectId(repository);
      const created = await this.createByKind(repository, kind, normalizeCreateInput(input, projectId));
      await auditRepository.create({
        actorId: viewer.id,
        action: "create",
        resourceType: kind,
        resourceId: created.id
      });
      return created;
    });
  }

  async update(kind: MasterDataKind, viewer: User, id: string, input: UpdateMasterDataInput): Promise<MasterDataRecord> {
    requireAdmin(viewer);
    validateMasterDataInput(kind, input, true);
    return this.repository.transaction(async (context) => {
      const repository = this.repository.withContext(context);
      const auditRepository = this.auditRepository.withContext(context);
      const updated = await this.updateByKind(repository, kind, id, input);
      if (!updated) throw notFound(`${kind} not found`);
      await auditRepository.create({
        actorId: viewer.id,
        action: "update",
        resourceType: kind,
        resourceId: id
      });
      return updated;
    });
  }

  private async resolveProjectId(repository: MasterDataRepository): Promise<string> {
    const projectId = await repository.findDefaultProjectId();
    if (!projectId) throw badRequest("project is not initialized");
    return projectId;
  }

  private createByKind(
    repository: MasterDataRepository,
    kind: MasterDataKind,
    input: NormalizedMasterDataCreateInput
  ): Promise<MasterDataRecord> {
    if (kind === "sections") return repository.createSection(input);
    if (kind === "organizations") {
      return repository.createOrganization({
        ...input,
        type: input.type ?? "contractor"
      });
    }
    if (kind === "areas") return repository.createArea(input);
    return repository.createDiscipline(input);
  }

  private updateByKind(
    repository: MasterDataRepository,
    kind: MasterDataKind,
    id: string,
    input: UpdateMasterDataInput
  ): Promise<MasterDataRecord | undefined> {
    if (kind === "sections") return repository.updateSection(id, input);
    if (kind === "organizations") return repository.updateOrganization(id, input);
    if (kind === "areas") return repository.updateArea(id, input);
    return repository.updateDiscipline(id, input);
  }
}

function canIncludeInactive(viewer: User, includeInactive: boolean): boolean {
  return viewer.role === "admin" && includeInactive;
}

type MasterDataCreateInput = {
  name?: string;
  code?: string;
  type?: OrganizationType;
  parentId?: string;
};

type NormalizedMasterDataCreateInput = {
  projectId: string;
  name: string;
  code: string;
  type?: OrganizationType;
  parentId?: string;
};

function requireAdmin(user: User): void {
  if (user.role !== "admin") throw forbidden();
}

function validateMasterDataInput(kind: MasterDataKind, input: MasterDataCreateInput | UpdateMasterDataInput, partial = false): void {
  if (!partial && (!input.name || !input.code)) throw badRequest("name and code are required");
  if (input.name !== undefined && !input.name.trim()) throw badRequest("name is required");
  if (input.code !== undefined && !input.code.trim()) throw badRequest("code is required");
  if (kind === "organizations" && input.type && !["owner", "supervisor", "contractor", "other"].includes(input.type)) {
    throw badRequest("organization type is invalid");
  }
}

function normalizeCreateInput(input: MasterDataCreateInput, projectId: string): NormalizedMasterDataCreateInput {
  return {
    projectId,
    name: input.name ?? "",
    code: input.code ?? "",
    type: input.type,
    parentId: input.parentId
  };
}
