import { mapUserRecord } from "../../mappers/prismaRecords.js";
import type { Organization, Role, User } from "../../types.js";
import type { RepositoryContext } from "../context.js";

const userWithScopes = {
  sectionScopes: {
    select: {
      sectionId: true
    }
  }
} as const;

export interface UserListFilters {
  search?: string;
  role?: Role;
  active?: boolean;
}

export interface CreateUserInput {
  projectId: string;
  organizationId: string;
  name: string;
  phone: string;
  username: string;
  role: Role;
  passwordHash: string;
  sectionScopeIds: string[];
  isActive?: boolean;
}

export interface UpdateUserInput {
  organizationId?: string;
  name?: string;
  phone?: string;
  username?: string;
  role?: Role;
  isActive?: boolean;
  sectionScopeIds?: string[];
}

export class UsersRepository {
  constructor(private readonly context: RepositoryContext) {}

  withContext(context: RepositoryContext): UsersRepository {
    return new UsersRepository(context);
  }

  async list(filters: UserListFilters = {}): Promise<User[]> {
    const records = await this.context.prisma.user.findMany({
      where: {
        role: filters.role,
        isActive: filters.active,
        OR: filters.search
          ? [
              { name: { contains: filters.search, mode: "insensitive" } },
              { username: { contains: filters.search, mode: "insensitive" } },
              { phone: { contains: filters.search, mode: "insensitive" } }
            ]
          : undefined
      },
      include: userWithScopes,
      orderBy: [{ role: "asc" }, { name: "asc" }]
    });

    return records.map(mapUserRecord);
  }

  async findById(userId: string): Promise<User | undefined> {
    const record = await this.context.prisma.user.findUnique({
      where: { id: userId },
      include: userWithScopes
    });

    return record ? mapUserRecord(record) : undefined;
  }

  async findDefaultProjectId(): Promise<string | undefined> {
    const project = await this.context.prisma.project.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" }
    });
    return project?.id;
  }

  async findOrganizationById(organizationId: string): Promise<Organization | undefined> {
    const organization = await this.context.prisma.organization.findUnique({
      where: { id: organizationId }
    });
    return organization ?? undefined;
  }

  async countSectionsByIds(sectionIds: string[]): Promise<number> {
    if (sectionIds.length === 0) return 0;
    return this.context.prisma.section.count({
      where: {
        id: {
          in: sectionIds
        }
      }
    });
  }

  async existsWithUsername(username: string, excludeUserId?: string): Promise<boolean> {
    const user = await this.context.prisma.user.findFirst({
      where: {
        username,
        id: excludeUserId ? { not: excludeUserId } : undefined
      },
      select: { id: true }
    });
    return Boolean(user);
  }

  async existsWithPhone(phone: string, excludeUserId?: string): Promise<boolean> {
    const user = await this.context.prisma.user.findFirst({
      where: {
        phone,
        id: excludeUserId ? { not: excludeUserId } : undefined
      },
      select: { id: true }
    });
    return Boolean(user);
  }

  async create(input: CreateUserInput): Promise<User> {
    const record = await this.context.prisma.user.create({
      data: {
        projectId: input.projectId,
        organizationId: input.organizationId,
        name: input.name,
        phone: input.phone,
        username: input.username,
        role: input.role,
        passwordHash: input.passwordHash,
        isActive: input.isActive ?? true,
        sectionScopes: {
          create: input.sectionScopeIds.map((sectionId) => ({ sectionId }))
        }
      },
      include: userWithScopes
    });

    return mapUserRecord(record);
  }

  async update(userId: string, input: UpdateUserInput): Promise<User | undefined> {
    const exists = await this.context.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });
    if (!exists) return undefined;

    const record = await this.context.prisma.user.update({
      where: { id: userId },
      data: {
        organizationId: input.organizationId,
        name: input.name,
        phone: input.phone,
        username: input.username,
        role: input.role,
        isActive: input.isActive,
        sectionScopes: input.sectionScopeIds
          ? {
              deleteMany: {},
              create: input.sectionScopeIds.map((sectionId) => ({ sectionId }))
            }
          : undefined
      },
      include: userWithScopes
    });

    return mapUserRecord(record);
  }

  async resetPassword(userId: string, passwordHash: string): Promise<boolean> {
    const result = await this.context.prisma.user.updateMany({
      where: { id: userId },
      data: { passwordHash }
    });
    return result.count > 0;
  }

  async transaction<T>(callback: (context: RepositoryContext) => Promise<T>): Promise<T> {
    const prisma = this.context.prisma;
    if ("$transaction" in prisma) {
      return prisma.$transaction((transactionClient) => callback({ prisma: transactionClient }));
    }
    return callback(this.context);
  }
}
