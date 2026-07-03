import { mapNotificationRecord } from "../../mappers/prismaRecords.js";
import type { Notification } from "../../types.js";
import type { RepositoryContext } from "../context.js";

export class NotificationsRepository {
  constructor(private readonly context: RepositoryContext) {}

  async listForUser(userId: string): Promise<Notification[]> {
    const records = await this.context.prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: "desc" }
    });

    return records.map(mapNotificationRecord);
  }

  async unreadCountForUser(userId: string): Promise<number> {
    return this.context.prisma.notification.count({
      where: {
        recipientId: userId,
        readAt: null
      }
    });
  }
}
