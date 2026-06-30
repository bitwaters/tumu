import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../data.js";

const store = createStore();

type SqlValue = unknown;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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

const drawingRows = store.drawings.map(({ revisions: _revisions, ...drawing }) => drawing);
const revisionRows = store.drawings.flatMap((drawing) =>
  drawing.revisions.map(({ pages: _pages, ...revision }) => revision)
);
const pageRows = store.drawings.flatMap((drawing) => drawing.revisions.flatMap((revision) => revision.pages));

const seedSql = [
  `TRUNCATE TABLE "IdempotencyRecord", "AuditLog", "ExportJob", "Notification", "WorkflowLog", "PhotoAttachment", "SiteItem", "DrawingRevisionPage", "DrawingRevision", "Drawing", "Discipline", "Area", "UserSectionScope", "User", "Organization", "Section", "Project" CASCADE;`,
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
    "Drawing",
    drawingRows.map((drawing) => ({
      ...drawing,
      disciplineId: drawing.disciplineId ?? null
    }))
  ),
  insert("DrawingRevision", revisionRows),
  insert("DrawingRevisionPage", pageRows),
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
