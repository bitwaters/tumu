import type { Notification, User } from "../../types.js";
import type { NotificationsRepository } from "../../repositories/notifications/index.js";

export class NotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}

  async list(viewer: User): Promise<Notification[]> {
    return this.repository.listForUser(viewer.id);
  }

  async unreadCount(viewer: User): Promise<{ count: number }> {
    return { count: await this.repository.unreadCountForUser(viewer.id) };
  }
}
