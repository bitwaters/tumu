import type { Notification } from "../types.js";
import type { ApiClient } from "./client.js";

export class NotificationsApi {
  constructor(private readonly client: ApiClient) {}

  list(): Promise<Notification[]> {
    return this.client.get<Notification[]>("/notifications");
  }

  unreadCount(): Promise<{ count: number }> {
    return this.client.get<{ count: number }>("/notifications/unread-count");
  }

  markRead(notificationId: string): Promise<Notification> {
    return this.client.post<Notification>(`/notifications/${notificationId}/read`);
  }

  markAllRead(): Promise<{ ok: true }> {
    return this.client.post<{ ok: true }>("/notifications/read-all");
  }
}
