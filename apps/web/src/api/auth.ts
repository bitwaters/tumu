import type { User } from "../types.js";
import type { ApiClient } from "./client.js";

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  login(username: string, password: string): Promise<LoginResponse> {
    return this.client.post<LoginResponse>("/auth/login", { username, password });
  }

  currentUser(): Promise<{ user: User }> {
    return this.client.get<{ user: User }>("/auth/me");
  }

  logout(): Promise<{ ok: true }> {
    return this.client.post<{ ok: true }>("/auth/logout");
  }

  changePassword(input: { currentPassword: string; newPassword: string }): Promise<{ ok: true }> {
    return this.client.post<{ ok: true }>("/auth/change-password", input);
  }
}
