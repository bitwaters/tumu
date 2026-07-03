export interface ApiConfig {
  host: string;
  port: number;
  runtimeMode: "memory" | "prisma";
  databaseUrl: string;
  redisUrl: string;
  objectStorageEndpoint: string;
  objectStorageBucket: string;
  objectStorageAccessKey: string;
  objectStorageSecretKey: string;
  jwtSecret: string;
  uploadMaxBytes: number;
  idempotencyTtlHours: number;
}

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): ApiConfig {
  return {
    host: process.env.API_HOST ?? "127.0.0.1",
    port: readNumber("API_PORT", 4000),
    runtimeMode: readRuntimeMode(),
    databaseUrl: process.env.DATABASE_URL ?? "postgresql://site_user:site_password@127.0.0.1:55432/site_management",
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379/0",
    objectStorageEndpoint: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000",
    objectStorageBucket: process.env.S3_BUCKET ?? "site-management",
    objectStorageAccessKey: process.env.S3_ACCESS_KEY ?? "minioadmin",
    objectStorageSecretKey: process.env.S3_SECRET_KEY ?? "minioadmin",
    jwtSecret: process.env.JWT_SECRET ?? "site-management-dev-secret",
    uploadMaxBytes: readNumber("UPLOAD_MAX_BYTES", 10 * 1024 * 1024),
    idempotencyTtlHours: readNumber("IDEMPOTENCY_TTL_HOURS", 24)
  };
}

function readRuntimeMode(): ApiConfig["runtimeMode"] {
  const configured = process.env.API_RUNTIME;
  if (configured === "memory" || configured === "prisma") return configured;
  return "prisma";
}
