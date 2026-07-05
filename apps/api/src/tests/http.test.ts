import { test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { setCorsHeaders, writeJson } from "../http.js";

test("http helpers use configured CORS origin", () => {
  const response = createResponseStub();

  setCorsHeaders(response, "https://power-site.example");

  equal(response.headers.get("access-control-allow-origin"), "https://power-site.example");
  equal(response.headers.get("access-control-allow-methods"), "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  equal(response.headers.get("access-control-allow-headers"), "authorization,content-type,idempotency-key");
});

test("writeJson preserves configured CORS origin", () => {
  const response = createResponseStub();

  writeJson(response, 201, { ok: true }, "https://power-site.example");

  equal(response.statusCode, 201);
  equal(response.headers.get("access-control-allow-origin"), "https://power-site.example");
  equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  deepEqual(JSON.parse(response.body), { ok: true });
});

function createResponseStub(): Pick<ServerResponse, "setHeader" | "end"> & { statusCode: number; headers: Map<string, string>; body: string } {
  const headers = new Map<string, string>();
  return {
    statusCode: 0,
    headers,
    body: "",
    setHeader(name: string, value: number | string | readonly string[]) {
      headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(",") : String(value));
      return this as unknown as ServerResponse;
    },
    end(chunk?: unknown) {
      this.body = typeof chunk === "string" ? chunk : "";
      return this as unknown as ServerResponse;
    }
  };
}
