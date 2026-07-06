import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { after, test } from "node:test";
import { equal, ok, rejects } from "node:assert/strict";
import { loadConfig } from "../config.js";
import type { ApiRequest, Router } from "../http.js";
import { buildPrismaRouter } from "../prismaRoutes.js";
import { createPrismaRuntime, type PrismaRuntime } from "../runtime/prisma.js";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  test("Prisma-backed route harness requires TEST_DATABASE_URL", { skip: "Set TEST_DATABASE_URL and run npm --workspace @site-management/api run test:db:reset first." }, () => {});
} else {
  let runtime: PrismaRuntime | undefined;

  after(async () => {
    await runtime?.disconnect();
  });

  test("Prisma-backed route harness preserves the API contract", async () => {
    await execFileAsync("node", ["dist/prisma/testDatabase.js", "reset"], {
      cwd: process.cwd(),
      env: { ...process.env, TEST_DATABASE_URL: databaseUrl }
    });

    const config = {
      ...loadConfig(),
      databaseUrl,
      runtimeMode: "prisma" as const
    };
    runtime = createPrismaRuntime(config);
    await runtime.connect();
    const router = buildPrismaRouter(runtime.prisma, config);
    const request = createPrismaHarness(router);

    const adminToken = await login(request, "admin", "local-admin-demo-password");
    const supervisorToken = await login(request, "wang.supervisor");
    const rectifierToken = await login(request, "zhao.fix");
    const installRectifierToken = await login(request, "chen.fix");

    const me = (await request("GET", "/auth/me", undefined, supervisorToken)) as { user: { username: string } };
    equal(me.user.username, "wang.supervisor");

    await rejectsWithStatus(() => request("GET", "/users", undefined, supervisorToken), 403);
    const users = (await request("GET", "/users", undefined, adminToken)) as Array<{ username: string; sectionScopeIds: string[]; passwordHash?: string }>;
    const supervisor = users.find((user) => user.username === "wang.supervisor");
    ok(supervisor?.sectionScopeIds.includes("sec-civil-a"));
    equal(supervisor?.passwordHash, undefined);

    const createdUser = (await request(
      "POST",
      "/users",
      {
        organizationId: "org-civil",
        name: "Prisma 新整改人",
        phone: "13800007777",
        username: "prisma.fix",
        role: "rectifier",
        password: "local-user-demo-password",
        sectionScopeIds: ["sec-civil-a"]
      },
      adminToken,
      "prisma-user-create"
    )) as { id: string; username: string; sectionScopeIds: string[] };
    const replayedUser = (await request(
      "POST",
      "/users",
      {
        organizationId: "org-civil",
        name: "Prisma 新整改人",
        phone: "13800007777",
        username: "prisma.fix",
        role: "rectifier",
        password: "local-user-demo-password",
        sectionScopeIds: ["sec-civil-a"]
      },
      adminToken,
      "prisma-user-create"
    )) as { id: string; username: string; sectionScopeIds: string[] };
    equal(createdUser.username, "prisma.fix");
    equal(createdUser.sectionScopeIds[0], "sec-civil-a");
    equal(replayedUser.id, createdUser.id);
    await rejectsWithStatus(
      () =>
        request(
          "POST",
          "/users",
          {
            organizationId: "org-civil",
            name: "Prisma 缺密码整改人",
            phone: "13800007776",
            username: "prisma.missing.password",
            role: "rectifier",
            sectionScopeIds: ["sec-civil-a"]
          },
          adminToken
        ),
      400
    );
    await rejectsWithStatus(() => request("POST", `/users/${createdUser.id}/reset-password`, {}, adminToken), 400);
    await rejectsWithStatus(
      () =>
        request(
          "POST",
          "/users",
          {
            organizationId: "org-civil",
            name: "Prisma 幂等冲突整改人",
            phone: "13800007779",
            username: "prisma.fix.conflict",
            role: "rectifier",
            password: "local-user-demo-password",
            sectionScopeIds: ["sec-civil-a"]
          },
          adminToken,
          "prisma-user-create"
        ),
      409
    );
    await rejectsWithStatus(
      () =>
        request(
          "POST",
          "/users",
          {
            organizationId: "org-civil",
            name: "Prisma 重复整改人",
            phone: "13800007778",
            username: "prisma.fix",
            role: "rectifier",
            password: "local-user-demo-password",
            sectionScopeIds: ["sec-civil-a"]
          },
          adminToken
        ),
      400
    );
    await request("PATCH", `/users/${createdUser.id}/disable`, undefined, adminToken);
    await rejectsWithStatus(() => login(request, "prisma.fix"), 401);

    const scopedSections = (await request("GET", "/master-data/sections", undefined, rectifierToken)) as Array<{ id: string }>;
    equal(scopedSections.length, 1);
    equal(scopedSections[0]?.id, "sec-civil-a");
    await rejectsWithStatus(() => request("POST", "/master-data/areas", { name: "无权区域", code: "NOPE" }, rectifierToken), 403);
    const createdArea = (await request("POST", "/master-data/areas", { name: "Prisma 临建区", code: "P-TEMP" }, adminToken)) as { id: string; code: string };
    equal(createdArea.code, "P-TEMP");
    const updatedArea = (await request("PATCH", `/master-data/areas/${createdArea.id}`, { name: "Prisma 临建区更新" }, adminToken)) as { name: string };
    equal(updatedArea.name, "Prisma 临建区更新");

    const presign = (await request("POST", "/photos/presign", { fileName: "IMG_P_001.jpg", mimeType: "image/jpeg", sizeBytes: 1024 }, supervisorToken)) as { objectKey: string };
    const discoveryPhoto = (await request(
      "POST",
      "/photos/complete",
      { objectKey: presign.objectKey, fileName: "IMG_P_001.jpg", mimeType: "image/jpeg", sizeBytes: 1024 },
      supervisorToken,
      "prisma-photo-discovery"
    )) as { id: string };
    const replayedDiscoveryPhoto = (await request(
      "POST",
      "/photos/complete",
      { objectKey: presign.objectKey, fileName: "IMG_P_001.jpg", mimeType: "image/jpeg", sizeBytes: 1024 },
      supervisorToken,
      "prisma-photo-discovery"
    )) as { id: string };
    equal(replayedDiscoveryPhoto.id, discoveryPhoto.id);
    await rejectsWithStatus(
      () =>
        request(
          "POST",
          "/photos/complete",
          { objectKey: "uploads/u-supervisor/IMG_P_002.jpg", fileName: "IMG_P_002.jpg", mimeType: "image/jpeg", sizeBytes: 1024 },
          supervisorToken,
          "prisma-photo-discovery"
        ),
      409
    );

    const createBody = {
      sectionId: "sec-civil-a",
      type: "defect",
      severity: "important",
      title: "Prisma 路由测试缺陷",
      areaId: "area-main",
      disciplineId: "disc-civil",
      photoIds: [discoveryPhoto.id]
    };
    const first = (await request("POST", "/site-items", createBody, supervisorToken, "prisma-create-1")) as { id: string; itemNo: string; photos: { discovery: Array<{ id: string }> } };
    const second = (await request("POST", "/site-items", createBody, supervisorToken, "prisma-create-1")) as { id: string; itemNo: string };
    equal(second.id, first.id);
    equal(second.itemNo, first.itemNo);
    equal(first.photos.discovery[0]?.id, discoveryPhoto.id);
    await rejectsWithStatus(() => request("POST", "/site-items", { ...createBody, title: "Prisma 幂等冲突" }, supervisorToken, "prisma-create-1"), 409);

    const rollbackPhoto = await uploadPhoto(request, supervisorToken, "u-supervisor", "rollback.jpg", "prisma-photo-rollback");
    await rejectsWithStatus(
      () =>
        request(
          "POST",
          "/site-items",
          {
            sectionId: "sec-civil-a",
            type: "defect",
            severity: "normal",
            title: "Prisma 应回滚事项",
            areaId: "area-main",
            disciplineId: "disc-civil",
            photoIds: [rollbackPhoto.id, "missing-photo"]
          },
          supervisorToken,
          "prisma-create-rollback"
        ),
      400
    );
    const rollbackSearch = (await request("GET", "/site-items?search=Prisma%20应回滚事项", undefined, supervisorToken)) as unknown[];
    equal(rollbackSearch.length, 0);
    const unboundAfterRollback = (await request("GET", "/photos?unboundOnly=true&search=rollback", undefined, supervisorToken)) as Array<{ id: string }>;
    equal(unboundAfterRollback[0]?.id, rollbackPhoto.id);

    await request("POST", `/site-items/${first.id}/dispatch`, { responsibleOrgId: "org-civil", responsibleUserId: "u-rectifier-civil" }, supervisorToken, "prisma-dispatch-1");
    await rejectsWithStatus(() => request("POST", `/site-items/${first.id}/close`, {}, rectifierToken), 403);
    await request("POST", `/site-items/${first.id}/start-rectify`, {}, rectifierToken, "prisma-start-1");
    const rectificationPhoto = await uploadPhoto(request, rectifierToken, "u-rectifier-civil", "rectification.jpg", "prisma-photo-rectification");
    await request("POST", `/site-items/${first.id}/submit-review`, { photoIds: [rectificationPhoto.id] }, rectifierToken, "prisma-submit-1");
    const reviewPhoto = await uploadPhoto(request, supervisorToken, "u-supervisor", "review.jpg", "prisma-photo-review");
    const closed = (await request("POST", `/site-items/${first.id}/close`, { photoIds: [reviewPhoto.id] }, supervisorToken, "prisma-close-1")) as { status: string; photos: { rectification: unknown[]; review: unknown[] } };
    equal(closed.status, "closed");
    equal(closed.photos.rectification.length, 1);
    equal(closed.photos.review.length, 1);

    const workflowRollbackPhoto = await uploadPhoto(request, rectifierToken, "u-rectifier-civil", "workflow-rollback.jpg", "prisma-photo-workflow-rollback");
    await rejectsWithStatus(
      () => request("POST", "/site-items/item-001/submit-review", { photoIds: [workflowRollbackPhoto.id, "missing-photo"] }, rectifierToken, "prisma-workflow-rollback"),
      400
    );
    const rolledBackItem = (await request("GET", "/site-items/item-001", undefined, rectifierToken)) as { status: string };
    equal(rolledBackItem.status, "rectifying");
    const workflowRollbackUnbound = (await request("GET", "/photos?unboundOnly=true&search=workflow-rollback", undefined, rectifierToken)) as Array<{ id: string }>;
    equal(workflowRollbackUnbound[0]?.id, workflowRollbackPhoto.id);

    const ownerOnlyPhoto = await uploadPhoto(request, supervisorToken, "u-supervisor", "owner-only.jpg", "prisma-photo-owner-only");
    const photoPreview = (await request("GET", `/photos/${ownerOnlyPhoto.id}/preview`, undefined, supervisorToken)) as { previewUrl: string };
    ok(photoPreview.previewUrl.includes("owner-only.jpg"));
    await rejectsWithStatus(() => request("GET", `/photos/${ownerOnlyPhoto.id}/preview`, undefined, rectifierToken), 404);
    await request("DELETE", `/photos/${ownerOnlyPhoto.id}`, undefined, supervisorToken, "prisma-delete-photo");
    await rejectsWithStatus(() => request("GET", `/photos/${ownerOnlyPhoto.id}/preview`, undefined, supervisorToken), 404);

    const unread = (await request("GET", "/notifications/unread-count", undefined, rectifierToken)) as { count: number };
    ok(unread.count > 0);
    const notifications = (await request("GET", "/notifications", undefined, rectifierToken)) as Array<{ id: string }>;
    await request("POST", `/notifications/${notifications[0]?.id}/read`, undefined, rectifierToken);
    await request("POST", "/notifications/read-all", undefined, rectifierToken);
    const auditLogs = (await request("GET", "/audit/logs?resourceType=SiteItem", undefined, adminToken)) as unknown[];
    ok(auditLogs.length > 0);
    await rejectsWithStatus(() => request("GET", "/audit/logs", undefined, rectifierToken), 403);

    await runtime.disconnect();
    runtime = createPrismaRuntime(config);
    await runtime.connect();
    const restartedRequest = createPrismaHarness(buildPrismaRouter(runtime.prisma, config));
    const persisted = (await restartedRequest("GET", `/site-items/${first.id}`, undefined, supervisorToken)) as { id: string; status: string };
    equal(persisted.id, first.id);
    equal(persisted.status, "closed");
  });
}

function createPrismaHarness(router: Router) {
  return async function request(method: string, path: string, body?: unknown, token?: string, idempotencyKey?: string) {
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
      rawBody: body ? JSON.stringify(body) : "",
      rawBuffer: body ? Buffer.from(JSON.stringify(body)) : new Uint8Array()
    };
    return match.route.handler(apiRequest);
  };
}

async function login(request: ReturnType<typeof createPrismaHarness>, username: string, password = "local-user-demo-password"): Promise<string> {
  const result = (await request("POST", "/auth/login", { username, password })) as { accessToken: string };
  return result.accessToken;
}

async function uploadPhoto(
  request: ReturnType<typeof createPrismaHarness>,
  token: string,
  userId: string,
  fileName: string,
  idempotencyKey: string
): Promise<{ id: string }> {
  return request(
    "POST",
    "/photos/complete",
    {
      objectKey: `uploads/${userId}/${fileName}`,
      fileName,
      mimeType: "image/jpeg",
      sizeBytes: 1024
    },
    token,
    idempotencyKey
  ) as Promise<{ id: string }>;
}

async function rejectsWithStatus(fn: () => Promise<unknown>, status: number): Promise<void> {
  await rejects(fn, (error: unknown) => {
    return typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === status;
  });
}
