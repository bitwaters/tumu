import type { Server } from "node:http";
import type { ApiConfig } from "../config.js";
import type { Router } from "../http.js";
import type { Store } from "../types.js";
import type { PrismaRuntime } from "./prisma.js";
import { createLegacyMemoryRuntime } from "./legacyRuntime.js";

export interface ApiRuntime {
  router: Router;
  server: Server;
  store?: Store;
  prismaRuntime?: PrismaRuntime;
  close: () => Promise<void>;
}

export async function createApiRuntime(config: ApiConfig): Promise<ApiRuntime> {
  if (config.runtimeMode === "memory") {
    return createLegacyMemoryRuntime(config);
  }

  throw new Error(
    "API_RUNTIME=prisma is configured, but Prisma-backed route wiring is not complete yet. Use API_RUNTIME=memory for legacy development until persistence migration tasks finish."
  );
}
