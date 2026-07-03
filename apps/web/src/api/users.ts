import type { Role, User } from "../types.js";
import type { ApiClient } from "./client.js";

export interface UserListQuery {
  search?: string;
  role?: Role;
  active?: boolean;
}

export interface UserWriteInput {
  organizationId?: string;
  name?: string;
  phone?: string;
  username?: string;
  role?: Role;
  password?: string;
  isActive?: boolean;
  sectionScopeIds?: string[];
}

export class UsersApi {
  constructor(private readonly client: ApiClient) {}

  list(query: UserListQuery = {}): Promise<User[]> {
    return this.client.get<User[]>("/users", { query: { ...query } });
  }

  visible(query: UserListQuery = {}): Promise<User[]> {
    return this.client.get<User[]>("/users/visible", { query: { ...query } });
  }

  create(input: UserWriteInput, idempotencyKey: string): Promise<User> {
    return this.client.post<User>("/users", input, { idempotencyKey });
  }

  update(userId: string, input: UserWriteInput): Promise<User> {
    return this.client.patch<User>(`/users/${userId}`, input);
  }

  disable(userId: string): Promise<User> {
    return this.client.patch<User>(`/users/${userId}/disable`, {});
  }

  resetPassword(userId: string, password: string): Promise<{ ok: true }> {
    return this.client.post<{ ok: true }>(`/users/${userId}/reset-password`, { password });
  }
}
