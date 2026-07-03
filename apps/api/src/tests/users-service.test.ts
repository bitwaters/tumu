import { test } from "node:test";
import { ok } from "node:assert/strict";
import type { Organization, User } from "../types.js";
import type { AuditRepository } from "../repositories/audit/index.js";
import type { IdempotencyRepository } from "../repositories/idempotency/index.js";
import type { UsersRepository } from "../repositories/users/index.js";
import { loadConfig } from "../config.js";
import { IdempotencyService } from "../services/idempotency/index.js";
import { UsersService } from "../services/users/index.js";

const admin: User = {
  id: "u-admin",
  organizationId: "org-owner",
  name: "管理员",
  phone: "13800000000",
  username: "admin",
  role: "admin",
  isActive: true,
  sectionScopeIds: ["sec-a"],
  passwordHash: "hash"
};

const supervisorUser: User = {
  id: "u-target",
  organizationId: "org-supervision",
  name: "监理",
  phone: "13800000001",
  username: "target",
  role: "supervisor",
  isActive: true,
  sectionScopeIds: ["sec-a"],
  passwordHash: "hash"
};

test("user update validates contractor role against existing organization", async () => {
  const service = new UsersService(
    createUsersRepositoryStub(supervisorUser, { id: "org-supervision", projectId: "project", name: "监理单位", type: "supervisor", isActive: true }),
    createAuditRepositoryStub(),
    new IdempotencyService(createIdempotencyRepositoryStub(), loadConfig())
  );

  await rejects(() => service.update(admin, supervisorUser.id, { role: "rectifier" }));
});

function createUsersRepositoryStub(existingUser: User, organization: Organization): UsersRepository {
  const repository = {
    list: async () => [existingUser],
    findById: async () => existingUser,
    findDefaultProjectId: async () => "project",
    findOrganizationById: async () => organization,
    countSectionsByIds: async (sectionIds: string[]) => sectionIds.length,
    existsWithUsername: async () => false,
    existsWithPhone: async () => false,
    create: async () => existingUser,
    update: async () => existingUser,
    resetPassword: async () => true,
    withContext: () => repository,
    transaction: async (callback: (context: never) => Promise<unknown>) => callback({} as never)
  } as unknown as UsersRepository;
  return repository;
}

function createAuditRepositoryStub(): AuditRepository {
  return {
    create: async () => ({
      id: "audit-1",
      actorId: admin.id,
      action: "update",
      resourceType: "User",
      resourceId: supervisorUser.id,
      createdAt: new Date().toISOString()
    }),
    withContext: () => createAuditRepositoryStub()
  } as unknown as AuditRepository;
}

function createIdempotencyRepositoryStub(): IdempotencyRepository {
  const repository = {
    find: async () => undefined,
    acquireTransactionLock: async () => undefined,
    create: async () => ({
      id: "idem-1",
      actorId: admin.id,
      method: "POST",
      path: "/users",
      key: "key",
      requestHash: "hash",
      responseStatus: 200,
      responseBody: {},
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString()
    }),
    withContext: () => repository
  } as unknown as IdempotencyRepository;
  return repository;
}

async function rejects(fn: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await fn();
  } catch {
    rejected = true;
  }
  ok(rejected, "Expected function to reject");
}
