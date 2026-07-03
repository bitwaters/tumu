import { equal, rejects } from "node:assert/strict";
import { test } from "node:test";
import { ApiClient, ApiError } from "./client.js";
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

test("api client maps API errors", async () => {
  const client = new ApiClient({
    baseUrl: "http://api.local",
    fetchImpl: async () => jsonResponse(403, { message: "Forbidden" })
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
