import { test } from "node:test";
import { equal, ok } from "node:assert/strict";
import { loadConfig } from "../config.js";
import { createStore } from "../data.js";
import { buildRouter } from "../routes.js";
import type { ApiRequest, Router } from "../http.js";

const config = loadConfig();

function createHarness() {
  const store = createStore();
  const router = buildRouter(store, config);
  async function request(method: string, path: string, body?: unknown, token?: string, idempotencyKey?: string) {
    const url = new URL(path, "http://local.test");
    const match = router.match(method, url.pathname);
    if (!match) throw new Error(`No route for ${method} ${path}`);
    const apiRequest: ApiRequest = {
      method,
      path: url.pathname,
      params: match.params,
      query: url.searchParams,
      headers: {
        authorization: token ? `Bearer ${token}` : undefined,
        "idempotency-key": idempotencyKey,
        "user-agent": "node-test"
      },
      body,
      rawBody: body ? JSON.stringify(body) : ""
    };
    return match.route.handler(apiRequest);
  }
  return { store, router, request };
}

async function login(request: ReturnType<typeof createHarness>["request"], username: string, password = "password123") {
  const result = (await request("POST", "/auth/login", { username, password })) as { accessToken: string };
  return result.accessToken;
}

test("auth returns current user and rejects disabled users", async () => {
  const { store, request } = createHarness();
  const token = await login(request, "wang.supervisor");
  const me = (await request("GET", "/auth/me", undefined, token)) as { user: { username: string } };
  equal(me.user.username, "wang.supervisor");
  store.users.find((user) => user.username === "wang.supervisor")!.isActive = false;
  await rejects(() => request("POST", "/auth/login", { username: "wang.supervisor", password: "password123" }));
});

test("current user can change password with audit trail", async () => {
  const { store, request } = createHarness();
  const token = await login(request, "wang.supervisor");

  await rejects(() =>
    request("POST", "/auth/change-password", { currentPassword: "wrong-password", newPassword: "new-password-1" }, token)
  );
  await login(request, "wang.supervisor", "password123");

  const result = (await request(
    "POST",
    "/auth/change-password",
    { currentPassword: "password123", newPassword: "new-password-1" },
    token
  )) as { ok: true };

  equal(result.ok, true);
  await rejects(() => request("GET", "/auth/me", undefined, token));
  await rejects(() => login(request, "wang.supervisor", "password123"));
  await login(request, "wang.supervisor", "new-password-1");
  ok(store.auditLogs.some((log) => log.actorId === "u-supervisor" && log.action === "change_password"));
});

test("admin can manage users, non-admin cannot", async () => {
  const { store, request } = createHarness();
  const adminToken = await login(request, "admin", "admin123");
  const supervisorToken = await login(request, "wang.supervisor");
  await rejects(() => request("GET", "/users", undefined, supervisorToken));
  const created = (await request(
    "POST",
    "/users",
    {
      organizationId: "org-civil",
      name: "新增整改人",
      phone: "13800009999",
      username: "new.fix",
      role: "rectifier",
      password: "password123",
      sectionScopeIds: ["sec-civil-a"]
    },
    adminToken,
    "create-user-1"
  )) as { username: string; sectionScopeIds: string[] };
  equal(created.username, "new.fix");
  equal(created.sectionScopeIds[0], "sec-civil-a");
  await rejects(() =>
    request(
      "POST",
      "/users",
      {
        organizationId: "org-civil",
        name: "缺密码用户",
        phone: "13800008887",
        username: "missing.password",
        role: "rectifier",
        sectionScopeIds: ["sec-civil-a"]
      },
      adminToken
    )
  );
  ok(!store.users.some((user) => user.username === "missing.password"));
  await rejects(() =>
    request(
      "POST",
      "/users",
      {
        organizationId: "org-civil",
        name: "重复账号",
        phone: "13800008888",
        username: "new.fix",
        role: "rectifier",
        password: "password123",
        sectionScopeIds: ["sec-civil-a"]
      },
      adminToken
    )
  );
  const rectifier = store.users.find((user) => user.id === "u-rectifier-civil")!;
  const previousPasswordHash = rectifier.passwordHash;
  await rejects(() => request("POST", "/users/u-rectifier-civil/reset-password", {}, adminToken));
  equal(rectifier.passwordHash, previousPasswordHash);
  await rejects(() => request("PATCH", "/users/u-rectifier-civil", { phone: "13800000003" }, adminToken));
  equal(store.users.find((user) => user.id === "u-rectifier-civil")?.phone, "13800000004");
});

test("master data read is scoped and writes are admin-only", async () => {
  const { request } = createHarness();
  const adminToken = await login(request, "admin", "admin123");
  const rectifierToken = await login(request, "zhao.fix");
  const sections = (await request("GET", "/master-data/sections", undefined, rectifierToken)) as Array<{ id: string }>;
  ok(sections.some((section) => section.id === "sec-civil-a"));
  ok(!sections.some((section) => section.id === "sec-install-b"));
  const organizations = (await request("GET", "/master-data/organizations", undefined, rectifierToken)) as Array<{ id: string }>;
  equal(organizations.length, 1);
  equal(organizations[0]?.id, "org-civil");
  await rejects(() => request("POST", "/master-data/areas", { name: "临建区", code: "TEMP" }, rectifierToken));
  const area = (await request("POST", "/master-data/areas", { name: "临建区", code: "TEMP" }, adminToken)) as { code: string };
  equal(area.code, "TEMP");
});

test("drawing APIs enforce admin writes and expose revision previews", async () => {
  const { request } = createHarness();
  const adminToken = await login(request, "admin", "admin123");
  const supervisorToken = await login(request, "wang.supervisor");
  const installRectifierToken = await login(request, "chen.fix");
  await rejects(() => request("POST", "/drawings", { areaId: "area-main", name: "临时图", code: "TMP" }, supervisorToken));
  const drawing = (await request("POST", "/drawings", { areaId: "area-main", disciplineId: "disc-civil", name: "临时图", code: "TMP" }, adminToken)) as { id: string };
  const revision = (await request("POST", `/drawings/${drawing.id}/revisions`, { revisionNo: "A", fileKey: "drawings/tmp.pdf", pageCount: 2, isCurrent: true }, adminToken)) as { id: string };
  const pages = (await request("GET", `/drawing-revisions/${revision.id}/pages`, undefined, supervisorToken)) as Array<{ pageNumber: number }>;
  equal(pages.length, 2);
  const preview = (await request("GET", `/drawing-revisions/${revision.id}/preview`, undefined, supervisorToken)) as { previewUrl: string };
  ok(preview.previewUrl.includes("preview=1"));
  await rejects(() => request("GET", `/drawings/${drawing.id}/revisions`, undefined, installRectifierToken));
  await rejects(() => request("GET", `/drawing-revisions/${revision.id}/pages`, undefined, installRectifierToken));
  await rejects(() => request("GET", `/drawing-revisions/${revision.id}/preview`, undefined, installRectifierToken));
});

test("site item workflow applies role permissions and idempotency", async () => {
  const { store, request } = createHarness();
  const supervisorToken = await login(request, "wang.supervisor");
  const rectifierToken = await login(request, "zhao.fix");
  const created = (await request(
    "POST",
    "/site-items",
    {
      sectionId: "sec-civil-a",
      type: "defect",
      severity: "important",
      title: "测试缺陷",
      areaId: "area-main",
      disciplineId: "disc-civil"
    },
    supervisorToken,
    "create-item-1"
  )) as { id: string; itemNo: string };
  const duplicate = (await request(
    "POST",
    "/site-items",
    {
      sectionId: "sec-civil-a",
      type: "defect",
      severity: "important",
      title: "测试缺陷",
      areaId: "area-main",
      disciplineId: "disc-civil"
    },
    supervisorToken,
    "create-item-1"
  )) as { id: string; itemNo: string };
  equal(duplicate.id, created.id);
  await request("PATCH", `/site-items/${created.id}`, { title: "修改后的标题", status: "closed", ownerUserId: "u-admin", closedAt: "2026-06-29T00:00:00Z" }, supervisorToken);
  const patched = store.siteItems.find((item) => item.id === created.id)!;
  equal(patched.title, "修改后的标题");
  equal(patched.status, "pending_approval");
  equal(patched.ownerUserId, "u-supervisor");
  equal(patched.closedAt, undefined);
  await rejects(() =>
    request(
      "POST",
      `/site-items/${created.id}/dispatch`,
      { responsibleOrgId: "org-civil", responsibleUserId: "u-rectifier-install" },
      supervisorToken,
      "dispatch-invalid-1"
    )
  );
  equal(store.siteItems.find((item) => item.id === created.id)?.status, "pending_approval");
  await request("POST", `/site-items/${created.id}/dispatch`, { responsibleOrgId: "org-civil", responsibleUserId: "u-rectifier-civil" }, supervisorToken, "dispatch-1");
  await rejects(() => request("POST", `/site-items/${created.id}/close`, {}, rectifierToken));
  await request("POST", `/site-items/${created.id}/start-rectify`, {}, rectifierToken, "start-1");
  await request("POST", `/site-items/${created.id}/submit-review`, { photoIds: [] }, rectifierToken, "review-1");
  await request("POST", `/site-items/${created.id}/close`, { photoIds: [] }, supervisorToken, "close-1");
  equal(store.siteItems.find((item) => item.id === created.id)?.status, "closed");
});

test("site item creation rolls back when discovery photo binding fails", async () => {
  const { store, request } = createHarness();
  const supervisorToken = await login(request, "wang.supervisor");
  store.photos.unshift({
    id: "photo-create-rollback",
    objectKey: "uploads/u-supervisor/create-rollback.jpg",
    thumbnailKey: "uploads/u-supervisor/create-rollback.jpg",
    fileName: "create-rollback.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    uploadedBy: "u-supervisor",
    uploadedAt: "2026-06-27T08:00:00Z"
  });
  const itemCount = store.siteItems.length;

  await rejects(() =>
    request(
      "POST",
      "/site-items",
      {
        sectionId: "sec-civil-a",
        type: "defect",
        severity: "normal",
        title: "应回滚事项",
        areaId: "area-main",
        disciplineId: "disc-civil",
        photoIds: ["photo-create-rollback", "photo-001"]
      },
      supervisorToken,
      "create-rollback-1"
    )
  );

  equal(store.siteItems.length, itemCount);
  equal(store.photos.find((photo) => photo.id === "photo-create-rollback")?.siteItemId, undefined);

  await rejects(() =>
    request(
      "POST",
      "/site-items",
      {
        sectionId: "sec-civil-a",
        type: "defect",
        severity: "normal",
        title: "无效责任人",
        areaId: "area-main",
        disciplineId: "disc-civil",
        responsibleOrgId: "org-civil",
        responsibleUserId: "u-rectifier-install"
      },
      supervisorToken,
      "create-invalid-assignee-1"
    )
  );
  equal(store.siteItems.length, itemCount);
});

test("workflow transition rolls back partial photo bindings on failure", async () => {
  const { store, request } = createHarness();
  const rectifierToken = await login(request, "zhao.fix");
  const alreadyBoundPhoto = store.photos.find((candidate) => candidate.id === "photo-001")!;
  store.photos.unshift({
    id: "photo-rollback",
    objectKey: "uploads/u-rectifier-civil/rollback.jpg",
    thumbnailKey: "uploads/u-rectifier-civil/rollback.jpg",
    fileName: "rollback.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    uploadedBy: "u-rectifier-civil",
    uploadedAt: "2026-06-27T08:00:00Z"
  });

  await rejects(() =>
    request(
      "POST",
      "/site-items/item-001/submit-review",
      { photoIds: ["photo-rollback", alreadyBoundPhoto.id] },
      rectifierToken,
      "rollback-review-1"
    )
  );

  equal(store.photos.find((candidate) => candidate.id === "photo-rollback")?.siteItemId, undefined);
  equal(store.siteItems.find((item) => item.id === "item-001")?.status, "rectifying");
});

test("photo gallery is personal and preview is authorized", async () => {
  const { request } = createHarness();
  const supervisorToken = await login(request, "wang.supervisor");
  const rectifierToken = await login(request, "zhao.fix");
  const presign = (await request("POST", "/photos/presign", { fileName: "IMG_001.jpg", mimeType: "image/jpeg", sizeBytes: 1024 }, supervisorToken)) as { objectKey: string };
  const photo = (await request("POST", "/photos/complete", { objectKey: presign.objectKey, fileName: "IMG_001.jpg", mimeType: "image/jpeg", sizeBytes: 1024 }, supervisorToken, "photo-1")) as { id: string };
  await rejects(() => request("POST", "/photos/complete", { objectKey: "uploads/u-rectifier-civil/stolen.jpg", fileName: "stolen.jpg", mimeType: "image/jpeg", sizeBytes: 1024 }, supervisorToken, "photo-stolen"));
  const mine = (await request("GET", "/photos?unboundOnly=true", undefined, supervisorToken)) as Array<{ id: string }>;
  ok(mine.some((candidate) => candidate.id === photo.id));
  await rejects(() => request("GET", `/photos/${photo.id}/preview`, undefined, rectifierToken));
  await request("DELETE", `/photos/${photo.id}`, undefined, supervisorToken);
  await rejects(() => request("GET", `/photos/${photo.id}/preview`, undefined, supervisorToken));
});

test("notifications and audit query are scoped", async () => {
  const { request } = createHarness();
  const adminToken = await login(request, "admin", "admin123");
  const rectifierToken = await login(request, "zhao.fix");
  const unread = (await request("GET", "/notifications/unread-count", undefined, rectifierToken)) as { count: number };
  ok(unread.count >= 1);
  await rejects(() => request("GET", "/audit/logs", undefined, rectifierToken));
  const logs = (await request("GET", "/audit/logs", undefined, adminToken)) as unknown[];
  ok(Array.isArray(logs));
});

test("site item ledger export is scoped and downloadable", async () => {
  const { request } = createHarness();
  const supervisorToken = await login(request, "wang.supervisor");
  const rectifierToken = await login(request, "zhao.fix");
  const installRectifierToken = await login(request, "chen.fix");

  const job = (await request("POST", "/exports/site-items", { sectionId: "sec-civil-a" }, supervisorToken)) as {
    id: string;
    status: string;
    artifactFileName?: string;
  };
  equal(job.status, "succeeded");
  ok(job.artifactFileName?.endsWith(".csv"));

  const status = (await request("GET", `/exports/${job.id}`, undefined, supervisorToken)) as { id: string; status: string };
  equal(status.id, job.id);
  equal(status.status, "succeeded");

  const download = (await request("GET", `/exports/${job.id}/download`, undefined, supervisorToken)) as {
    fileName: string;
    mimeType: string;
    contentBase64: string;
  };
  equal(download.mimeType, "text/csv; charset=utf-8");
  const csv = Buffer.from(download.contentBase64, "base64").toString("utf8");
  ok(csv.includes("ITEM-2026-0001"));
  ok(!csv.includes("ITEM-2026-0002"));

  await rejects(() => request("POST", "/exports/site-items", {}, rectifierToken));
  await rejects(() => request("GET", `/exports/${job.id}/download`, undefined, installRectifierToken));
});

test("photo package, closeout PDF and audit exports create downloadable artifacts", async () => {
  const { request } = createHarness();
  const adminToken = await login(request, "admin", "admin123");
  const supervisorToken = await login(request, "wang.supervisor");
  const installRectifierToken = await login(request, "chen.fix");

  const packageJob = (await request("POST", "/exports/photo-package", { sectionId: "sec-civil-a" }, supervisorToken)) as { id: string; status: string };
  equal(packageJob.status, "succeeded");
  const packageDownload = (await request("GET", `/exports/${packageJob.id}/download`, undefined, supervisorToken)) as {
    mimeType: string;
    contentBase64: string;
  };
  equal(packageDownload.mimeType, "application/zip");
  const packageText = Buffer.from(packageDownload.contentBase64, "base64").toString("utf8");
  ok(packageText.includes("manifest.csv"));
  ok(packageText.includes("ITEM-2026-0001"));

  const pdfJob = (await request("POST", "/exports/site-items/item-001/pdf", {}, supervisorToken)) as { id: string; status: string };
  equal(pdfJob.status, "succeeded");
  const pdfDownload = (await request("GET", `/exports/${pdfJob.id}/download`, undefined, supervisorToken)) as {
    mimeType: string;
    contentBase64: string;
  };
  equal(pdfDownload.mimeType, "application/pdf");
  ok(Buffer.from(pdfDownload.contentBase64, "base64").toString("utf8").includes("ITEM-2026-0001"));
  await rejects(() => request("POST", "/exports/site-items/item-001/pdf", {}, installRectifierToken));

  const auditJob = (await request("POST", "/exports/audit", { resourceType: "SiteItem" }, adminToken)) as { id: string; status: string };
  equal(auditJob.status, "succeeded");
  const auditDownload = (await request("GET", `/exports/${auditJob.id}/download`, undefined, adminToken)) as {
    mimeType: string;
    contentBase64: string;
  };
  equal(auditDownload.mimeType, "text/csv; charset=utf-8");
  ok(Buffer.from(auditDownload.contentBase64, "base64").toString("utf8").includes("SiteItem"));
  await rejects(() => request("POST", "/exports/audit", {}, supervisorToken));
});

test("master data imports validate rows, apply accepted rows and replay idempotent requests", async () => {
  const { store, request } = createHarness();
  const adminToken = await login(request, "admin", "admin123");
  const supervisorToken = await login(request, "wang.supervisor");
  const initialSections = store.sections.length;

  await rejects(() =>
    request(
      "POST",
      "/imports/sections",
      { sourceFileName: "sections.csv", csvText: "name,code\n非法标段,NOPE" },
      supervisorToken
    )
  );

  const csvText = "name,code,isActive\n调试标段,DBG,true\n重复标段,CIV-A,true";
  const job = (await request("POST", "/imports/sections", { sourceFileName: "sections.csv", csvText }, adminToken, "import-sections-1")) as {
    id: string;
    status: string;
    acceptedRows: number;
    rejectedRows: number;
    errors: Array<{ rowNumber: number; field?: string; message: string }>;
  };
  equal(job.status, "succeeded");
  equal(job.acceptedRows, 1);
  equal(job.rejectedRows, 1);
  equal(job.errors[0]?.rowNumber, 3);
  equal(store.sections.length, initialSections + 1);

  const replay = (await request("POST", "/imports/sections", { sourceFileName: "sections.csv", csvText }, adminToken, "import-sections-1")) as {
    id: string;
  };
  equal(replay.id, job.id);
  equal(store.sections.length, initialSections + 1);

  const status = (await request("GET", `/imports/${job.id}`, undefined, adminToken)) as { id: string; errors: unknown[]; passwordHash?: string };
  equal(status.id, job.id);
  ok(Array.isArray(status.errors));
  equal(status.passwordHash, undefined);
  ok(store.auditLogs.some((log) => log.action === "import_create" && log.resourceType === "Section"));
});

test("user imports validate references and never expose password hashes in job output", async () => {
  const { store, request } = createHarness();
  const adminToken = await login(request, "admin", "admin123");
  const csvText = [
    "organizationId,name,phone,username,role,password,sectionScopeIds,isActive",
    "org-civil,导入整改人,13800006666,import.fix,rectifier,secret123,sec-civil-a,true",
    "org-owner,错误整改人,phone-bad,bad.fix,rectifier,secret123,sec-civil-a,true",
    "org-civil,缺密码整改人,13800006667,missing.import.password,rectifier,,sec-civil-a,true"
  ].join("\n");

  const job = (await request("POST", "/imports/users", { sourceFileName: "users.csv", csvText }, adminToken, "import-users-1")) as {
    acceptedRows: number;
    rejectedRows: number;
    errors: Array<{ field?: string; message: string }>;
    passwordHash?: string;
  };

  equal(job.acceptedRows, 1);
  equal(job.rejectedRows, 2);
  equal(job.passwordHash, undefined);
  ok(job.errors.some((error) => error.field === "phone"));
  ok(job.errors.some((error) => error.field === "organizationId"));
  ok(job.errors.some((error) => error.field === "password"));
  ok(!store.users.some((user) => user.username === "missing.import.password"));
  const imported = store.users.find((user) => user.username === "import.fix");
  ok(imported?.passwordHash.startsWith("scrypt$"));
  ok(imported?.passwordHash !== "secret123");
  const loginResult = (await request("POST", "/auth/login", { username: "import.fix", password: "secret123" })) as { accessToken: string };
  ok(loginResult.accessToken);
});

async function rejects(fn: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await fn();
  } catch {
    rejected = true;
  }
  ok(rejected, "Expected function to reject");
}
