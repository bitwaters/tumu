import type { Role, User } from "../types.js";
import type { ApiClient } from "./client.js";

export interface UserListQuery {
  search?: string;
  role?: Role;
  active?: boolean;
}

export class UsersApi {
  constructor(private readonly client: ApiClient) {}

  list(query: UserListQuery = {}): Promise<User[]> {
    return this.client.get<User[]>("/users", { query: { ...query } });
  }

  visible(query: UserListQuery = {}): Promise<User[]> {
    return this.client.get<User[]>("/users/visible", { query: { ...query } });
  }
}
