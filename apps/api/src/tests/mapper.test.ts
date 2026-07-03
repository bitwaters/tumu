import { test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { allowedWorkflowActions } from "../authorization.js";
import { loadConfig } from "../config.js";
import { createStore } from "../data.js";
import {
  groupPhotosByStage,
  mapDrawingWithCurrentRevision,
  mapPublicUser,
  mapSiteItemDetail,
  mapUserSectionScopeIds
} from "../mappers/publicPayloads.js";

test("public user mapper keeps section scopes and hides password hash", () => {
  const store = createStore();
  const user = store.users.find((candidate) => candidate.id === "u-supervisor")!;
  const mapped = mapPublicUser(user);

  deepEqual(mapUserSectionScopeIds(user), ["sec-civil-a", "sec-install-b"]);
  equal(mapped.username, "wang.supervisor");
  ok(!("passwordHash" in mapped));
});

test("drawing mapper exposes the current revision without changing drawing shape", () => {
  const store = createStore();
  const drawing = mapDrawingWithCurrentRevision(store.drawings[0]!);

  equal(drawing.currentRevision?.id, "rev-main-b");
  equal(drawing.revisions.length, 1);
});

test("site item detail mapper groups photos, logs and allowed actions", () => {
  const store = createStore();
  const viewer = store.users.find((candidate) => candidate.id === "u-rectifier-civil")!;
  const item = store.siteItems.find((candidate) => candidate.id === "item-001")!;
  const detail = mapSiteItemDetail(store, viewer, item);

  equal(detail.photos.discovery.length, 1);
  equal(detail.photos.rectification.length, 0);
  equal(detail.workflowLogs[0]?.id, "log-002");
  deepEqual(detail.allowedActions, allowedWorkflowActions(viewer, item));
});

test("photo grouping ignores unrelated stages", () => {
  const store = createStore();
  const grouped = groupPhotosByStage(store.photos);

  equal(grouped.discovery.length, 1);
  equal(grouped.rectification.length, 0);
  equal(grouped.review.length, 0);
});

test("runtime mode defaults to prisma even when NODE_ENV is production", () => {
  const originalRuntime = process.env.API_RUNTIME;
  const originalNodeEnv = process.env.NODE_ENV;
  delete process.env.API_RUNTIME;
  process.env.NODE_ENV = "production";

  try {
    equal(loadConfig().runtimeMode, "prisma");
  } finally {
    if (originalRuntime === undefined) {
      delete process.env.API_RUNTIME;
    } else {
      process.env.API_RUNTIME = originalRuntime;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});
