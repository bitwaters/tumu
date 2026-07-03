import type { ApiConfig } from "../../config.js";
import { badRequest, unauthorized } from "../../errors.js";
import { hashPassword, issueToken, verifyPassword } from "../../security.js";
import { mapPublicUser } from "../../mappers/publicPayloads.js";
import type { User } from "../../types.js";
import type { AuthRepository } from "../../repositories/auth/index.js";
import type { AuditRepository } from "../../repositories/audit/index.js";
import type { UsersRepository } from "../../repositories/users/index.js";

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly config: ApiConfig,
    private readonly auditRepository: AuditRepository,
    private readonly usersRepository: UsersRepository
  ) {}

  async login(account: string, password: string): Promise<{ accessToken: string; user: Omit<User, "passwordHash"> }> {
    const user = await this.repository.findActiveUserByAccount(account);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw unauthorized("Invalid credentials");
    }

    await this.auditRepository.create({
      actorId: user.id,
      action: "login",
      resourceType: "User",
      resourceId: user.id
    });

    return {
      accessToken: issueToken(user.id, this.config, user.passwordHash),
      user: mapPublicUser(user)
    };
  }

  async logout(user: User): Promise<{ ok: true }> {
    await this.auditRepository.create({
      actorId: user.id,
      action: "logout",
      resourceType: "User",
      resourceId: user.id
    });
    return { ok: true };
  }

  async currentUser(userId: string): Promise<Omit<User, "passwordHash">> {
    const user = await this.repository.findActiveUserById(userId);
    if (!user) throw unauthorized();
    return mapPublicUser(user);
  }

  async changePassword(user: User, currentPassword: string | undefined, newPassword: string | undefined): Promise<{ ok: true }> {
    if (!currentPassword || !newPassword) throw badRequest("currentPassword and newPassword are required");
    if (newPassword.length < 8) throw badRequest("newPassword must be at least 8 characters");
    if (!verifyPassword(currentPassword, user.passwordHash)) throw unauthorized("Invalid current password");

    const updated = await this.usersRepository.resetPassword(user.id, hashPassword(newPassword));
    if (!updated) throw unauthorized();
    await this.auditRepository.create({
      actorId: user.id,
      action: "change_password",
      resourceType: "User",
      resourceId: user.id
    });
    return { ok: true };
  }
}
