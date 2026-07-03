import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { ApiConfig } from "./config.js";
import { HttpError, badRequest, forbidden, notFound, unauthorized } from "./errors.js";
import { verifyToken } from "./security.js";
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

function readBody(request: IncomingMessage): Promise<{ rawBody: string; body: unknown }> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      const rawBody = chunks.map((chunk) => Buffer.from(chunk as unknown as string).toString()).join("");
      if (!rawBody) {
        resolve({ rawBody, body: undefined });
        return;
      }
      try {
        resolve({ rawBody, body: JSON.parse(rawBody) });
      } catch {
        reject(badRequest("Invalid JSON body"));
      }
    });
  });
}

export function authenticate(request: ApiRequest, store: Store, config: ApiConfig): RequestContext {
  const header = request.headers.authorization;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw?.startsWith("Bearer ")) throw unauthorized();
  const userId = verifyToken(raw.slice("Bearer ".length), config);
  const user = store.users.find((candidate) => candidate.id === userId && candidate.isActive);
  if (!user) throw unauthorized();
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
      const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "127.0.0.1"}`);
      const matched = router.match(method, url.pathname);
      if (!matched) throw notFound(`No route for ${method} ${url.pathname}`);
      const { rawBody, body } = await readBody(incoming);
      const apiRequest: ApiRequest = {
        method,
        path: url.pathname,
        params: matched.params,
        query: url.searchParams,
        headers: incoming.headers,
        body,
        rawBody
      };
      const result = await matched.route.handler(apiRequest);
      writeJson(response, 200, { data: result ?? null });
    } catch (error) {
      handleError(response, error);
    }
  });
}

function handleError(response: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    writeJson(response, error.status, { error: { message: error.message, details: error.details ?? null } });
    return;
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    writeJson(response, 403, { error: { message: "Forbidden" } });
    return;
  }
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    writeJson(response, 401, { error: { message: "Unauthorized" } });
    return;
  }
  writeJson(response, 500, { error: { message: error instanceof Error ? error.message : "Internal server error" } });
}

export function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
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
