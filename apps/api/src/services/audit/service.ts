import { forbidden } from "../../errors.js";
import type { AuditLog, User } from "../../types.js";
import type { AuditLogFilters, AuditRepository } from "../../repositories/audit/index.js";

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async list(viewer: User, filters: AuditLogFilters = {}): Promise<AuditLog[]> {
    if (viewer.role !== "admin") throw forbidden();
    return this.repository.list(filters);
  }
}
