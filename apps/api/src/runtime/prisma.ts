import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ApiConfig } from "../config.js";

export interface PrismaRuntime {
  prisma: PrismaClient;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function createPrismaRuntime(config: ApiConfig): PrismaRuntime {
  const adapter = new PrismaPg({ connectionString: config.databaseUrl });
  const prisma = new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: 5_000,
      timeout: 10_000
    }
  });

  return {
    prisma,
    connect: () => prisma.$connect(),
    disconnect: () => prisma.$disconnect()
  };
}
