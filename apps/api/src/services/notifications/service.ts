import type { Notification, User } from "../../types.js";
import type { NotificationsRepository } from "../../repositories/notifications/index.js";
import { notFound } from "../../errors.js";

export class NotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}

  async list(viewer: User): Promise<Notification[]> {
    return this.repository.listForUser(viewer.id);
  }

  async unreadCount(viewer: User): Promise<{ count: number }> {
    return { count: await this.repository.unreadCountForUser(viewer.id) };
  }

  async markRead(viewer: User, notificationId: string): Promise<Notification> {
    const notification = await this.repository.markReadForUser(notificationId, viewer.id);
    if (!notification) throw notFound("Notification not found");
    return notification;
  }

  async markAllRead(viewer: User): Promise<{ ok: true }> {
    return this.repository.markAllReadForUser(viewer.id);
  }
}
