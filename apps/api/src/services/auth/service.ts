import type { ApiConfig } from "../../config.js";
import { unauthorized } from "../../errors.js";
import { issueToken, verifyPassword } from "../../security.js";
import { mapPublicUser } from "../../mappers/publicPayloads.js";
import type { User } from "../../types.js";
import type { AuthRepository } from "../../repositories/auth/index.js";
import type { AuditRepository } from "../../repositories/audit/index.js";

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly config: ApiConfig,
    private readonly auditRepository: AuditRepository
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
      accessToken: issueToken(user.id, this.config),
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
}
