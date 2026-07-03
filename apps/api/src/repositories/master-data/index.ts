import type { Area, Discipline, Organization, OrganizationType, Section } from "../../types.js";
import type { RepositoryContext } from "../context.js";
import { siteItemVisibilityWhere } from "../visibility.js";
import type { User } from "../../types.js";

export interface MasterDataListOptions {
  includeInactive?: boolean;
  ids?: string[];
}

export interface CreateSectionInput {
  projectId: string;
  name: string;
  code: string;
  isActive?: boolean;
}

export interface CreateOrganizationInput {
  projectId: string;
  name: string;
  type: OrganizationType;
  isActive?: boolean;
}

export interface CreateAreaInput extends CreateSectionInput {
  parentId?: string;
}

export type CreateDisciplineInput = CreateSectionInput;

export interface UpdateMasterDataInput {
  name?: string;
  code?: string;
  isActive?: boolean;
  type?: OrganizationType;
  parentId?: string | null;
}

export type MasterDataRecord = Section | Organization | Area | Discipline;

export class MasterDataRepository {
  constructor(private readonly context: RepositoryContext) {}

  withContext(context: RepositoryContext): MasterDataRepository {
    return new MasterDataRepository(context);
  }

  async findDefaultProjectId(): Promise<string | undefined> {
    const project = await this.context.prisma.project.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" }
    });
    return project?.id;
  }

  async listSections(options: MasterDataListOptions = {}): Promise<Section[]> {
    return this.context.prisma.section.findMany({
      where: buildActiveWhere(options),
      orderBy: { name: "asc" }
    });
  }

  async listOrganizations(options: MasterDataListOptions = {}): Promise<Organization[]> {
    return this.context.prisma.organization.findMany({
      where: buildActiveWhere(options),
      orderBy: { name: "asc" }
    });
  }

  async listAreas(options: MasterDataListOptions = {}): Promise<Area[]> {
    const records = await this.context.prisma.area.findMany({
      where: buildActiveWhere(options),
      orderBy: { name: "asc" }
    });
    return records.map((record) => ({ ...record, parentId: record.parentId ?? undefined }));
  }

  async listDisciplines(options: MasterDataListOptions = {}): Promise<Discipline[]> {
    return this.context.prisma.discipline.findMany({
      where: buildActiveWhere(options),
      orderBy: { name: "asc" }
    });
  }

  async visibleAreaIdsForUser(user: User): Promise<string[]> {
    const rows = await this.context.prisma.siteItem.findMany({
      where: siteItemVisibilityWhere(user),
      select: { areaId: true },
      distinct: ["areaId"]
    });
    return rows.map((row) => row.areaId);
  }

  async visibleDisciplineIdsForUser(user: User): Promise<string[]> {
    const rows = await this.context.prisma.siteItem.findMany({
      where: siteItemVisibilityWhere(user),
      select: { disciplineId: true },
      distinct: ["disciplineId"]
    });
    return rows.map((row) => row.disciplineId);
  }

  async createSection(input: CreateSectionInput): Promise<Section> {
    return this.context.prisma.section.create({ data: { ...input, isActive: input.isActive ?? true } });
  }

  async createOrganization(input: CreateOrganizationInput): Promise<Organization> {
    return this.context.prisma.organization.create({ data: { ...input, isActive: input.isActive ?? true } });
  }

  async createArea(input: CreateAreaInput): Promise<Area> {
    const record = await this.context.prisma.area.create({
      data: {
        ...input,
        isActive: input.isActive ?? true,
        parentId: input.parentId ?? null
      }
    });
    return { ...record, parentId: record.parentId ?? undefined };
  }

  async createDiscipline(input: CreateDisciplineInput): Promise<Discipline> {
    return this.context.prisma.discipline.create({ data: { ...input, isActive: input.isActive ?? true } });
  }

  async updateSection(id: string, input: UpdateMasterDataInput): Promise<Section | undefined> {
    const exists = await this.context.prisma.section.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return undefined;
    return this.context.prisma.section.update({
      where: { id },
      data: pickMasterDataUpdate(input)
    });
  }

  async updateOrganization(id: string, input: UpdateMasterDataInput): Promise<Organization | undefined> {
    const exists = await this.context.prisma.organization.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return undefined;
    return this.context.prisma.organization.update({
      where: { id },
      data: {
        ...pickMasterDataUpdate(input),
        type: input.type
      }
    });
  }

  async updateArea(id: string, input: UpdateMasterDataInput): Promise<Area | undefined> {
    const exists = await this.context.prisma.area.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return undefined;
    const record = await this.context.prisma.area.update({
      where: { id },
      data: {
        ...pickMasterDataUpdate(input),
        parentId: input.parentId
      }
    });
    return { ...record, parentId: record.parentId ?? undefined };
  }

  async updateDiscipline(id: string, input: UpdateMasterDataInput): Promise<Discipline | undefined> {
    const exists = await this.context.prisma.discipline.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return undefined;
    return this.context.prisma.discipline.update({
      where: { id },
      data: pickMasterDataUpdate(input)
    });
  }

  async transaction<T>(callback: (context: RepositoryContext) => Promise<T>): Promise<T> {
    const prisma = this.context.prisma;
    if ("$transaction" in prisma) {
      return prisma.$transaction((transactionClient) => callback({ prisma: transactionClient }));
    }
    return callback(this.context);
  }
}

function buildActiveWhere(options: MasterDataListOptions) {
  return {
    id: options.ids ? { in: options.ids } : undefined,
    isActive: options.includeInactive ? undefined : true
  };
}

function pickMasterDataUpdate(input: UpdateMasterDataInput) {
  return {
    name: input.name,
    code: input.code,
    isActive: input.isActive
  };
}
