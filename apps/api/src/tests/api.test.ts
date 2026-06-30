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

async function rejects(fn: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await fn();
  } catch {
    rejected = true;
  }
  ok(rejected, "Expected function to reject");
}
