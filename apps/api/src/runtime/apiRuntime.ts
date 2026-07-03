import type { Server } from "node:http";
import type { ApiConfig } from "../config.js";
import type { Router } from "../http.js";
import type { Store } from "../types.js";
import type { PrismaRuntime } from "./prisma.js";
import { createLegacyMemoryRuntime } from "./legacyRuntime.js";
import { buildPrismaRouter } from "../prismaRoutes.js";
import { createHttpServer } from "../http.js";
import { createPrismaRuntime } from "./prisma.js";

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

  const prismaRuntime = createPrismaRuntime(config);
  await prismaRuntime.connect();
  const router = buildPrismaRouter(prismaRuntime.prisma, config);
  const server = createHttpServer(router, config);

  return {
    router,
    server,
    prismaRuntime,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await prismaRuntime.disconnect();
    }
  };
}
