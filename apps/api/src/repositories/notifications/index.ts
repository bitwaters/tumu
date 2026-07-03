import { mapNotificationRecord } from "../../mappers/prismaRecords.js";
import type { Notification, NotificationType } from "../../types.js";
import type { RepositoryContext } from "../context.js";

export interface CreateNotificationInput {
  recipientId: string;
  siteItemId?: string;
  type: NotificationType;
  title: string;
  content: string;
}

export class NotificationsRepository {
  constructor(private readonly context: RepositoryContext) {}

  withContext(context: RepositoryContext): NotificationsRepository {
    return new NotificationsRepository(context);
  }

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

  async create(input: CreateNotificationInput): Promise<Notification> {
    const record = await this.context.prisma.notification.create({
      data: {
        recipientId: input.recipientId,
        siteItemId: input.siteItemId ?? null,
        type: input.type,
        title: input.title,
        content: input.content
      }
    });

    return mapNotificationRecord(record);
  }

  async markReadForUser(notificationId: string, userId: string, readAt = new Date()): Promise<Notification | undefined> {
    const existing = await this.context.prisma.notification.findFirst({
      where: {
        id: notificationId,
        recipientId: userId
      },
      select: { id: true }
    });
    if (!existing) return undefined;

    const record = await this.context.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt }
    });
    return mapNotificationRecord(record);
  }

  async markAllReadForUser(userId: string, readAt = new Date()): Promise<{ ok: true }> {
    await this.context.prisma.notification.updateMany({
      where: { recipientId: userId },
      data: { readAt }
    });
    return { ok: true };
  }
}
