import { mapPublicUser } from "../../mappers/publicPayloads.js";
import { badRequest, forbidden, notFound } from "../../errors.js";
import { hashPassword } from "../../security.js";
import type { PublicUser, Role, User } from "../../types.js";
import type { AuditRepository } from "../../repositories/audit/index.js";
import type { CreateUserInput, UpdateUserInput, UsersRepository } from "../../repositories/users/index.js";

export interface UserListOptions {
  search?: string;
  role?: Role;
  active?: boolean;
}

export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly auditRepository: AuditRepository
  ) {}

  async list(options: UserListOptions = {}): Promise<PublicUser[]> {
    const users = await this.repository.list(options);
    return users.map(mapPublicUser);
  }

  async findById(userId: string): Promise<PublicUser | undefined> {
    const user = await this.repository.findById(userId);
    return user ? mapPublicUser(user) : undefined;
  }

  async create(viewer: User, input: Omit<CreateUserInput, "projectId" | "passwordHash"> & { password?: string }): Promise<PublicUser> {
    requireAdmin(viewer);
    const projectId = await this.repository.findDefaultProjectId();
    if (!projectId) throw badRequest("project is not initialized");

    await this.validateUserInput(input);
    const created = await this.repository.create({
      ...input,
      projectId,
      passwordHash: hashPassword(input.password ?? "password123")
    });
    await this.auditRepository.create({
      actorId: viewer.id,
      action: "create",
      resourceType: "User",
      resourceId: created.id
    });
    return mapPublicUser(created);
  }

  async update(viewer: User, userId: string, input: UpdateUserInput): Promise<PublicUser> {
    requireAdmin(viewer);
    const existing = await this.repository.findById(userId);
    if (!existing) throw notFound("User not found");
    await this.validateUserInput(input, userId, existing);
    const updated = await this.repository.update(userId, input);
    if (!updated) throw notFound("User not found");
    await this.auditRepository.create({
      actorId: viewer.id,
      action: "update",
      resourceType: "User",
      resourceId: userId
    });
    return mapPublicUser(updated);
  }

  async disable(viewer: User, userId: string): Promise<PublicUser> {
    requireAdmin(viewer);
    const updated = await this.repository.update(userId, { isActive: false });
    if (!updated) throw notFound("User not found");
    await this.auditRepository.create({
      actorId: viewer.id,
      action: "disable",
      resourceType: "User",
      resourceId: userId
    });
    return mapPublicUser(updated);
  }

  async resetPassword(viewer: User, userId: string, password = "password123"): Promise<{ ok: true }> {
    requireAdmin(viewer);
    const changed = await this.repository.resetPassword(userId, hashPassword(password));
    if (!changed) throw notFound("User not found");
    await this.auditRepository.create({
      actorId: viewer.id,
      action: "reset_password",
      resourceType: "User",
      resourceId: userId
    });
    return { ok: true };
  }

  private async validateUserInput(input: Partial<CreateUserInput & UpdateUserInput>, existingUserId?: string, existingUser?: User): Promise<void> {
    if (input.role && !["admin", "supervisor", "contractor_manager", "rectifier"].includes(input.role)) {
      throw badRequest("role is invalid");
    }
    const finalOrganizationId = input.organizationId ?? existingUser?.organizationId;
    const finalRole = input.role ?? existingUser?.role;
    if (finalOrganizationId) {
      const organization = await this.repository.findOrganizationById(finalOrganizationId);
      if (!organization?.isActive) throw badRequest("organizationId is invalid");
      if ((finalRole === "contractor_manager" || finalRole === "rectifier") && organization.type !== "contractor") {
        throw badRequest("Contractor users require a contractor organization");
      }
    }
    if (input.sectionScopeIds) {
      const uniqueSectionIds = [...new Set(input.sectionScopeIds)];
      if (uniqueSectionIds.length !== input.sectionScopeIds.length) throw badRequest("sectionScopeIds include duplicate section");
      const existingCount = await this.repository.countSectionsByIds(uniqueSectionIds);
      if (existingCount !== uniqueSectionIds.length) throw badRequest("sectionScopeIds include invalid section");
    }
    if (input.username && (await this.repository.existsWithUsername(input.username, existingUserId))) {
      throw badRequest("username already exists");
    }
    if (input.phone && (await this.repository.existsWithPhone(input.phone, existingUserId))) {
      throw badRequest("phone already exists");
    }
  }
}

function requireAdmin(user: User): void {
  if (user.role !== "admin") throw forbidden();
}
