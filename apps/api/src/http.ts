import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { ApiConfig } from "./config.js";
import { HttpError, badRequest, forbidden, notFound, unauthorized } from "./errors.js";
import { stableHash, verifyTokenPayload } from "./security.js";
import type { RequestContext } from "./authorization.js";
import type { Store } from "./types.js";

export interface ApiRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  headers: IncomingMessage["headers"];
  body: unknown;
  rawBody: string;
  rawBuffer: Uint8Array;
  context?: RequestContext;
}

export type RouteHandler = (request: ApiRequest) => Promise<unknown> | unknown;

interface Route {
  method: string;
  pattern: string;
  keys: string[];
  regex: RegExp;
  handler: RouteHandler;
}

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: RouteHandler): void {
    const keys: string[] = [];
    const source = pattern
      .split("/")
      .map((part) => {
        if (part.startsWith(":")) {
          keys.push(part.slice(1));
          return "([^/]+)";
        }
        return part;
      })
      .join("/");
    this.routes.push({ method, pattern, keys, regex: new RegExp(`^${source}$`), handler });
  }

  match(method: string, path: string): { route: Route; params: Record<string, string> } | undefined {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.regex.exec(path);
      if (!match) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1] ?? "");
      });
      return { route, params };
    }
    return undefined;
  }
}

function readBody(request: IncomingMessage): Promise<{ rawBody: string; rawBuffer: Uint8Array; body: unknown }> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      const rawBuffer = concatChunks(chunks);
      const rawBody = Buffer.from(rawBuffer).toString();
      if (!rawBody) {
        resolve({ rawBody, rawBuffer, body: undefined });
        return;
      }
      const contentType = Array.isArray(request.headers["content-type"]) ? request.headers["content-type"][0] : request.headers["content-type"];
      if (!contentType?.includes("application/json")) {
        resolve({ rawBody, rawBuffer, body: undefined });
        return;
      }
      try {
        resolve({ rawBody, rawBuffer, body: JSON.parse(rawBody) });
      } catch {
        reject(badRequest("Invalid JSON body"));
      }
    });
  });
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return buffer;
}

export function authenticate(request: ApiRequest, store: Store, config: ApiConfig): RequestContext {
  const header = request.headers.authorization;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw?.startsWith("Bearer ")) throw unauthorized();
  const payload = verifyTokenPayload(raw.slice("Bearer ".length), config);
  const user = store.users.find((candidate) => candidate.id === payload.sub && candidate.isActive);
  if (!user) throw unauthorized();
  if (payload.pwd !== stableHash(user.passwordHash)) throw unauthorized();
  const context: RequestContext = {
    user,
    requestId: randomUUID(),
    ipAddress: undefined,
    userAgent: Array.isArray(request.headers["user-agent"]) ? request.headers["user-agent"][0] : request.headers["user-agent"]
  };
  request.context = context;
  return context;
}

export function requireContext(request: ApiRequest): RequestContext {
  if (!request.context) throw unauthorized();
  return request.context;
}

export function createHttpServer(router: Router, config: ApiConfig) {
  return createServer(async (incoming, response) => {
    try {
      const method = incoming.method ?? "GET";
      setCorsHeaders(response, config.corsAllowedOrigin);
      if (method === "OPTIONS") {
        response.statusCode = 204;
        response.end();
        return;
      }
      const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "127.0.0.1"}`);
      const matched = router.match(method, url.pathname);
      if (!matched) throw notFound(`No route for ${method} ${url.pathname}`);
      const { rawBody, rawBuffer, body } = await readBody(incoming);
      const apiRequest: ApiRequest = {
        method,
        path: url.pathname,
        params: matched.params,
        query: url.searchParams,
        headers: incoming.headers,
        body,
        rawBody,
        rawBuffer
      };
      const result = await matched.route.handler(apiRequest);
      writeJson(response, 200, { data: result ?? null }, config.corsAllowedOrigin);
    } catch (error) {
      handleError(response, error, config.corsAllowedOrigin);
    }
  });
}

function handleError(response: ServerResponse, error: unknown, corsAllowedOrigin: string): void {
  if (error instanceof HttpError) {
    writeJson(response, error.status, { error: { message: error.message, details: error.details ?? null } }, corsAllowedOrigin);
    return;
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    writeJson(response, 403, { error: { message: "Forbidden" } }, corsAllowedOrigin);
    return;
  }
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    writeJson(response, 401, { error: { message: "Unauthorized" } }, corsAllowedOrigin);
    return;
  }
  writeJson(response, 500, { error: { message: error instanceof Error ? error.message : "Internal server error" } }, corsAllowedOrigin);
}

type JsonResponseTarget = Pick<ServerResponse, "setHeader" | "end"> & { statusCode: number };

export function writeJson(response: JsonResponseTarget, status: number, body: unknown, corsAllowedOrigin = "*"): void {
  response.statusCode = status;
  setCorsHeaders(response, corsAllowedOrigin);
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export function setCorsHeaders(response: Pick<ServerResponse, "setHeader">, corsAllowedOrigin: string): void {
  response.setHeader("access-control-allow-origin", corsAllowedOrigin);
  response.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.setHeader("access-control-allow-headers", "authorization,content-type,idempotency-key");
}

export function assertRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("Request body must be an object");
  return body as Record<string, unknown>;
}

export function readString(body: Record<string, unknown>, key: string, required = true): string | undefined {
  const value = body[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (required) throw badRequest(`${key} is required`);
  return undefined;
}

export function readStringArray(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw badRequest(`${key} must be a string array`);
  return value as string[];
}

export function mapForbidden(callback: () => void): void {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") throw forbidden();
    throw error;
  }
}
