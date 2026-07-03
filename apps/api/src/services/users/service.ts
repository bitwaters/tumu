import { mapPublicUser } from "../../mappers/publicPayloads.js";
import { badRequest, forbidden, notFound } from "../../errors.js";
import { hashPassword } from "../../security.js";
import type { PublicUser, Role, User } from "../../types.js";
import type { AuditRepository } from "../../repositories/audit/index.js";
import type { CreateUserInput, UpdateUserInput, UsersRepository } from "../../repositories/users/index.js";
import { IdempotencyService, type IdempotencyRequest } from "../idempotency/index.js";

export interface UserListOptions {
  search?: string;
  role?: Role;
  active?: boolean;
}

export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly auditRepository: AuditRepository,
    private readonly idempotencyService: IdempotencyService
  ) {}

  async list(options: UserListOptions = {}): Promise<PublicUser[]> {
    const users = await this.repository.list(options);
    return users.map(mapPublicUser);
  }

  async listVisible(viewer: User, options: UserListOptions = {}): Promise<PublicUser[]> {
    if (viewer.role === "admin") return this.list(options);
    const users = await this.repository.list({ ...options, active: true });
    return users
      .filter((user) => canViewerSeeUser(viewer, user))
      .map(mapPublicUser);
  }

  async findById(userId: string): Promise<PublicUser | undefined> {
    const user = await this.repository.findById(userId);
    return user ? mapPublicUser(user) : undefined;
  }

  async create(
    viewer: User,
    input: Omit<CreateUserInput, "projectId" | "passwordHash"> & { password?: string },
    idempotency?: Pick<IdempotencyRequest, "key" | "method" | "path">
  ): Promise<PublicUser> {
    requireAdmin(viewer);
    return this.repository.transaction(async (context) => {
      const repository = this.repository.withContext(context);
      const auditRepository = this.auditRepository.withContext(context);
      const idempotencyService = this.idempotencyService.withContext(context);
      return idempotencyService.run(
        {
          actorId: viewer.id,
          method: idempotency?.method ?? "POST",
          path: idempotency?.path ?? "/users",
          key: idempotency?.key,
          requestBody: input
        },
        async () => {
          const projectId = await repository.findDefaultProjectId();
          if (!projectId) throw badRequest("project is not initialized");

          await this.validateUserInput(repository, input);
          const created = await repository.create({
            ...input,
            projectId,
            passwordHash: hashPassword(input.password ?? "password123")
          });
          await auditRepository.create({
            actorId: viewer.id,
            action: "create",
            resourceType: "User",
            resourceId: created.id
          });
          return { body: mapPublicUser(created) };
        }
      );
    });
  }

  async update(viewer: User, userId: string, input: UpdateUserInput): Promise<PublicUser> {
    requireAdmin(viewer);
    return this.repository.transaction(async (context) => {
      const repository = this.repository.withContext(context);
      const auditRepository = this.auditRepository.withContext(context);
      const existing = await repository.findById(userId);
      if (!existing) throw notFound("User not found");
      await this.validateUserInput(repository, input, userId, existing);
      const updated = await repository.update(userId, input);
      if (!updated) throw notFound("User not found");
      await auditRepository.create({
        actorId: viewer.id,
        action: "update",
        resourceType: "User",
        resourceId: userId
      });
      return mapPublicUser(updated);
    });
  }

  async disable(viewer: User, userId: string): Promise<PublicUser> {
    requireAdmin(viewer);
    if (viewer.id === userId) throw badRequest("cannot disable your own account");
    return this.repository.transaction(async (context) => {
      const repository = this.repository.withContext(context);
      const auditRepository = this.auditRepository.withContext(context);
      const updated = await repository.update(userId, { isActive: false });
      if (!updated) throw notFound("User not found");
      await auditRepository.create({
        actorId: viewer.id,
        action: "disable",
        resourceType: "User",
        resourceId: userId
      });
      return mapPublicUser(updated);
    });
  }

  async resetPassword(viewer: User, userId: string, password = "password123"): Promise<{ ok: true }> {
    requireAdmin(viewer);
    return this.repository.transaction(async (context) => {
      const repository = this.repository.withContext(context);
      const auditRepository = this.auditRepository.withContext(context);
      const changed = await repository.resetPassword(userId, hashPassword(password));
      if (!changed) throw notFound("User not found");
      await auditRepository.create({
        actorId: viewer.id,
        action: "reset_password",
        resourceType: "User",
        resourceId: userId
      });
      return { ok: true };
    });
  }

  private async validateUserInput(
    repository: UsersRepository,
    input: Partial<CreateUserInput & UpdateUserInput>,
    existingUserId?: string,
    existingUser?: User
  ): Promise<void> {
    if (input.role && !["admin", "supervisor", "contractor_manager", "rectifier"].includes(input.role)) {
      throw badRequest("role is invalid");
    }
    const finalOrganizationId = input.organizationId ?? existingUser?.organizationId;
    const finalRole = input.role ?? existingUser?.role;
    if (finalOrganizationId) {
      const organization = await repository.findOrganizationById(finalOrganizationId);
      if (!organization?.isActive) throw badRequest("organizationId is invalid");
      if ((finalRole === "contractor_manager" || finalRole === "rectifier") && organization.type !== "contractor") {
        throw badRequest("Contractor users require a contractor organization");
      }
    }
    if (input.sectionScopeIds) {
      const uniqueSectionIds = [...new Set(input.sectionScopeIds)];
      if (uniqueSectionIds.length !== input.sectionScopeIds.length) throw badRequest("sectionScopeIds include duplicate section");
      const existingCount = await repository.countSectionsByIds(uniqueSectionIds);
      if (existingCount !== uniqueSectionIds.length) throw badRequest("sectionScopeIds include invalid section");
    }
    if (input.username && (await repository.existsWithUsername(input.username, existingUserId))) {
      throw badRequest("username already exists");
    }
    if (input.phone && (await repository.existsWithPhone(input.phone, existingUserId))) {
      throw badRequest("phone already exists");
    }
  }
}

function requireAdmin(user: User): void {
  if (user.role !== "admin") throw forbidden();
}

function canViewerSeeUser(viewer: User, user: User): boolean {
  if (user.id === viewer.id) return true;
  const sharesSection = user.sectionScopeIds.some((sectionId) => viewer.sectionScopeIds.includes(sectionId));
  if (viewer.role === "supervisor") return sharesSection;
  if (viewer.role === "contractor_manager") return user.organizationId === viewer.organizationId && sharesSection;
  return false;
}
