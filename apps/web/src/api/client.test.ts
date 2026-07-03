import { deepEqual, equal, rejects } from "node:assert/strict";
import { test } from "node:test";
import { ApiClient, ApiError } from "./client.js";
import { ExportsApi } from "./exports.js";
import { createIdempotencyKey, IdempotencyKeyStore } from "./idempotency.js";
import { readFrontendConfig } from "./env.js";
import { clearStoredToken, readStoredToken, saveStoredToken, type TokenStorage } from "./session.js";

test("runtime config defaults to API mode and supports explicit mock fallback", () => {
  equal(readFrontendConfig({}).apiBaseUrl, "http://127.0.0.1:4000");
  equal(readFrontendConfig({}).useMocks, false);
  equal(readFrontendConfig({ VITE_API_BASE_URL: "http://api.local///", VITE_USE_MOCKS: "true" }).apiBaseUrl, "http://api.local");
  equal(readFrontendConfig({ VITE_USE_MOCKS: "true" }).useMocks, true);
});

test("session storage persists and clears token", () => {
  const storage = createMemoryStorage();
  saveStoredToken("token-1", storage);
  equal(readStoredToken(storage), "token-1");
  clearStoredToken(storage);
  equal(readStoredToken(storage), null);
});

test("api client sends bearer token, query params, JSON body, and idempotency key", async () => {
  const storage = createMemoryStorage();
  saveStoredToken("token-1", storage);
  let captured: { url: string; init: RequestInit } | undefined;
  const client = new ApiClient({
    baseUrl: "http://api.local",
    tokenStorage: storage,
    fetchImpl: async (url, init) => {
      captured = { url: String(url), init: init ?? {} };
      return jsonResponse(200, { ok: true });
    }
  });

  const result = await client.post<{ ok: boolean }>("/site-items", { title: "事项" }, { query: { overdue: true }, idempotencyKey: "idem-1" });

  equal(result.ok, true);
  equal(captured?.url, "http://api.local/site-items?overdue=true");
  const headers = new Headers(captured?.init.headers);
  equal(headers.get("authorization"), "Bearer token-1");
  equal(headers.get("content-type"), "application/json");
  equal(headers.get("idempotency-key"), "idem-1");
  equal(captured?.init.body, JSON.stringify({ title: "事项" }));
});

test("api client unwraps backend data envelopes", async () => {
  const client = new ApiClient({
    baseUrl: "http://api.local",
    fetchImpl: async () => jsonResponse(200, { data: [{ id: "item-1" }] })
  });

  const result = await client.get<Array<{ id: string }>>("/site-items");

  deepEqual(result, [{ id: "item-1" }]);
});

test("api client maps API errors", async () => {
  const client = new ApiClient({
    baseUrl: "http://api.local",
    fetchImpl: async () => jsonResponse(403, { error: { message: "Forbidden", details: null } })
  });

  await rejects(() => client.get("/audit/logs"), (error) => error instanceof ApiError && error.status === 403 && error.message === "Forbidden");
});

test("api client clears token and calls unauthorized handler on 401", async () => {
  const storage = createMemoryStorage();
  saveStoredToken("expired", storage);
  let unauthorized = false;
  const client = new ApiClient({
    baseUrl: "http://api.local",
    tokenStorage: storage,
    onUnauthorized: () => {
      unauthorized = true;
    },
    fetchImpl: async () => jsonResponse(401, { message: "Unauthorized" })
  });

  await rejects(() => client.get("/auth/me"), { status: 401 });
  equal(readStoredToken(storage), null);
  equal(unauthorized, true);
});

test("idempotency helpers create stable keys for retries", () => {
  equal(createIdempotencyKey("create", "fixed"), "create:fixed");
  const store = new IdempotencyKeyStore();
  const first = store.get("submit:item-1", "workflow");
  const retry = store.get("submit:item-1", "workflow");
  equal(first, retry);
  store.clear("submit:item-1");
  const next = store.get("submit:item-1", "workflow");
  equal(first === next, false);
});

test("exports api maps import, export, status, and download routes", async () => {
  const calls: Array<{ url: string; method?: string; body?: string; idempotencyKey?: string | null }> = [];
  const client = new ApiClient({
    baseUrl: "http://api.local",
    fetchImpl: async (url, init = {}) => {
      const headers = new Headers(init.headers);
      calls.push({
        url: String(url),
        method: init.method,
        body: typeof init.body === "string" ? init.body : undefined,
        idempotencyKey: headers.get("idempotency-key")
      });
      return jsonResponse(200, { data: { id: "job-1", status: "succeeded", type: "excel", kind: "sections" } });
    }
  });
  const exportsApi = new ExportsApi(client);

  await exportsApi.createSiteItemLedger({ status: "rectifying" });
  await exportsApi.createPhotoPackage({ areaId: "area-1" });
  await exportsApi.createCloseoutPdf("item-1");
  await exportsApi.createAuditExport({ action: "create" });
  await exportsApi.getExportJob("job-1");
  await exportsApi.downloadExport("job-1");
  await exportsApi.createImport("sections", { csvText: "name,code\nA,A" }, "idem-import-1");
  await exportsApi.getImportJob("import-1");

  deepEqual(calls.map((call) => [call.method, call.url]), [
    ["POST", "http://api.local/exports/site-items"],
    ["POST", "http://api.local/exports/photo-package"],
    ["POST", "http://api.local/exports/site-items/item-1/pdf"],
    ["POST", "http://api.local/exports/audit"],
    ["GET", "http://api.local/exports/job-1"],
    ["GET", "http://api.local/exports/job-1/download"],
    ["POST", "http://api.local/imports/sections"],
    ["GET", "http://api.local/imports/import-1"]
  ]);
  equal(calls[6]?.idempotencyKey, "idem-import-1");
  equal(calls[0]?.body, JSON.stringify({ status: "rectifying" }));
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function createMemoryStorage(): TokenStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    }
  };
}
