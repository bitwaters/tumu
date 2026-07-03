import type { AuditLog } from "../types.js";
import type { ApiClient } from "./client.js";

export interface AuditLogQuery {
  resourceType?: string;
  action?: string;
}

export class AuditApi {
  constructor(private readonly client: ApiClient) {}

  list(query: AuditLogQuery = {}): Promise<AuditLog[]> {
    return this.client.get<AuditLog[]>("/audit/logs", { query: { ...query } });
  }
}
