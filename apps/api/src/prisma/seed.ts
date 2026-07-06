import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../data.js";

ensureSeedPasswordsConfigured();

const store = createStore();

type SqlValue = unknown;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function ensureSeedPasswordsConfigured(): void {
  const hasSharedPassword = Boolean(process.env.SEED_DEMO_PASSWORD);
  const hasSpecificPasswords = Boolean(process.env.SEED_ADMIN_PASSWORD && process.env.SEED_USER_PASSWORD);
  const allowLocalFallback = process.env.ALLOW_INSECURE_DEMO_PASSWORDS === "true" || process.env.NODE_ENV === "test";

  if (!hasSharedPassword && !hasSpecificPasswords && !allowLocalFallback) {
    throw new Error(
      "Seed passwords are required. Set SEED_DEMO_PASSWORD, or set both SEED_ADMIN_PASSWORD and SEED_USER_PASSWORD. For local-only demo data, set ALLOW_INSECURE_DEMO_PASSWORDS=true."
    );
  }

  for (const [name, value] of Object.entries({
    SEED_DEMO_PASSWORD: process.env.SEED_DEMO_PASSWORD,
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
    SEED_USER_PASSWORD: process.env.SEED_USER_PASSWORD
  })) {
    if (!value) continue;
    if (value.includes("CHANGE_ME") || value === "admin123" || value === "password123") {
      throw new Error(`${name} must be replaced with a non-default value before seeding.`);
    }
  }
}

function sql(value: SqlValue | undefined): string {
  if (value === undefined || value === null) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insert(table: string, rows: object[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const values = rows
    .map((row) => {
      const valuesByColumn = row as Record<string, SqlValue>;
      return `(${columns.map((column) => sql(valuesByColumn[column])).join(", ")})`;
    })
    .join(",\n");
  return `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES\n${values};`;
}

const seedSql = [
  `TRUNCATE TABLE "IdempotencyRecord", "AuditLog", "ImportJob", "ExportJob", "Notification", "WorkflowLog", "PhotoAttachment", "SiteItem", "Discipline", "Area", "UserSectionScope", "User", "Organization", "Section", "Project" CASCADE;`,
  insert("Project", [store.project]),
  insert("Section", store.sections),
  insert("Organization", store.organizations),
  insert("Area", store.areas.map((area) => ({ ...area, parentId: area.parentId ?? null }))),
  insert("Discipline", store.disciplines),
  insert(
    "User",
    store.users.map(({ sectionScopeIds: _sectionScopeIds, ...user }) => ({
      ...user,
      projectId: store.project.id
    }))
  ),
  insert(
    "UserSectionScope",
    store.users.flatMap((user) =>
      user.sectionScopeIds.map((sectionId) => ({
        id: `scope-${user.id}-${sectionId}`,
        userId: user.id,
        sectionId
      }))
    )
  ),
  insert(
    "SiteItem",
    store.siteItems.map((item) => ({
      ...item,
      responsibleOrgId: item.responsibleOrgId ?? null,
      responsibleUserId: item.responsibleUserId ?? null,
      submittedForReviewAt: item.submittedForReviewAt ?? null,
      closedAt: item.closedAt ?? null,
      reopenedAt: item.reopenedAt ?? null,
      voidedAt: item.voidedAt ?? null
    }))
  ),
  insert(
    "PhotoAttachment",
    store.photos.map((photo) => ({
      ...photo,
      siteItemId: photo.siteItemId ?? null,
      stage: photo.stage ?? null,
      deletedAt: photo.deletedAt ?? null,
      sectionSnapshot: photo.sectionSnapshot ?? null,
      areaSnapshot: photo.areaSnapshot ?? null,
      disciplineSnapshot: photo.disciplineSnapshot ?? null,
      responsibleOrgSnapshot: photo.responsibleOrgSnapshot ?? null
    }))
  ),
  insert(
    "WorkflowLog",
    store.workflowLogs.map((log) => ({
      ...log,
      fromStatus: log.fromStatus ?? null,
      toStatus: log.toStatus ?? null
    }))
  ),
  insert(
    "Notification",
    store.notifications.map((notification) => ({
      ...notification,
      siteItemId: notification.siteItemId ?? null,
      readAt: notification.readAt ?? null
    }))
  ),
  insert("ExportJob", store.exportJobs),
  insert("ImportJob", store.importJobs),
  insert(
    "AuditLog",
    store.auditLogs.map((log) => ({
      ...log,
      metadata: log.metadata ?? null
    }))
  )
].join("\n\n");

const child = spawn("npm", ["exec", "prisma", "--", "db", "execute", "--stdin"], {
  cwd: packageRoot,
  stdio: ["pipe", "inherit", "inherit"]
});

child.stdin.end(seedSql);

const exitCode = await new Promise<number | null>((resolveExit) => {
  child.on("close", resolveExit);
});

if (exitCode !== 0) {
  throw new Error(`Seed SQL execution failed with exit code ${exitCode ?? "unknown"}.`);
}

console.log(`Seeded ${store.users.length} users and ${store.siteItems.length} site items.`);
