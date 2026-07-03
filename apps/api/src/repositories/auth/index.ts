import { mapUserRecord } from "../../mappers/prismaRecords.js";
import type { User } from "../../types.js";
import type { RepositoryContext } from "../context.js";

const userWithScopes = {
  sectionScopes: {
    select: {
      sectionId: true
    }
  }
} as const;

export class AuthRepository {
  constructor(private readonly context: RepositoryContext) {}

  async findActiveUserByAccount(account: string): Promise<User | undefined> {
    const record = await this.context.prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [{ username: account }, { phone: account }]
      },
      include: userWithScopes
    });

    return record ? mapUserRecord(record) : undefined;
  }

  async findActiveUserById(userId: string): Promise<User | undefined> {
    const record = await this.context.prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true
      },
      include: userWithScopes
    });

    return record ? mapUserRecord(record) : undefined;
  }
}
