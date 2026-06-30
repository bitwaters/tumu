import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://site_user:site_password@127.0.0.1:55432/site_management"
  },
  migrations: {
    path: "prisma/migrations",
    seed: "node dist/prisma/seed.js"
  }
});
