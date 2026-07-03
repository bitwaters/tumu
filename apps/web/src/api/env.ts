export interface FrontendRuntimeConfig {
  apiBaseUrl: string;
  useMocks: boolean;
}

const defaultApiBaseUrl = "http://127.0.0.1:4000";

export function readFrontendConfig(source: Record<string, unknown> = readImportMetaEnv()): FrontendRuntimeConfig {
  return {
    apiBaseUrl: normalizeBaseUrl(readString(source.VITE_API_BASE_URL) || defaultApiBaseUrl),
    useMocks: readBoolean(source.VITE_USE_MOCKS)
  };
}

function readImportMetaEnv(): Record<string, unknown> {
  return ((import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {}) as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value.toLowerCase() === "true";
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}
