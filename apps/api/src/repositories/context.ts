import type { Prisma, PrismaClient } from "@prisma/client";

export type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export interface RepositoryContext {
  prisma: PrismaExecutor;
}
