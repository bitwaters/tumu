import { clearStoredToken, readStoredToken, type TokenStorage } from "./session.js";

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  tokenStorage?: TokenStorage;
  onUnauthorized?: () => void;
}

export interface ApiRequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: HeadersInit;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly tokenStorage?: TokenStorage;
  private readonly onUnauthorized?: () => void;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.tokenStorage = options.tokenStorage;
    this.onUnauthorized = options.onUnauthorized;
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const headers = new Headers(options.headers);
    const token = readStoredToken(this.tokenStorage);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(buildUrl(this.baseUrl, path, options.query), {
      method: options.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      signal: options.signal
    });
    const responseBody = await parseResponseBody(response);

    if (!response.ok) {
      if (response.status === 401) {
        clearStoredToken(this.tokenStorage);
        this.onUnauthorized?.();
      }
      throw new ApiError(readErrorMessage(responseBody, response.status), response.status, responseBody);
    }

    return unwrapSuccessBody<T>(responseBody);
  }

  get<T>(path: string, options: Omit<ApiRequestOptions, "method" | "body"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  post<T>(path: string, body?: unknown, options: Omit<ApiRequestOptions, "method" | "body"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  patch<T>(path: string, body?: unknown, options: Omit<ApiRequestOptions, "method" | "body"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "PATCH", body });
  }

  delete<T>(path: string, options: Omit<ApiRequestOptions, "method"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }
}

function buildUrl(baseUrl: string, path: string, query?: ApiRequestOptions["query"]): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return JSON.parse(text);
  return text;
}

function readErrorMessage(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
    if (typeof record.error === "object" && record.error !== null) {
      const error = record.error as Record<string, unknown>;
      if (typeof error.message === "string") return error.message;
    }
  }
  return `Request failed with status ${status}`;
}

function unwrapSuccessBody<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}
