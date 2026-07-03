import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { loadConfig } from "../config.js";

type Command = "setup" | "reset";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] as Command | undefined;
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? loadConfig().databaseUrl;

if (command !== "setup" && command !== "reset") {
  throw new Error("Usage: node dist/prisma/testDatabase.js <setup|reset>");
}

if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL or DATABASE_URL is required for database test setup.");
}

if (command === "reset" && !process.env.TEST_DATABASE_URL && process.env.ALLOW_DATABASE_RESET !== "true") {
  throw new Error("Refusing to reset DATABASE_URL. Set TEST_DATABASE_URL, or set ALLOW_DATABASE_RESET=true explicitly.");
}

if (command === "setup" && !process.env.TEST_DATABASE_URL && process.env.ALLOW_DATABASE_SEED !== "true") {
  throw new Error("Refusing to seed DATABASE_URL. Set TEST_DATABASE_URL, or set ALLOW_DATABASE_SEED=true explicitly.");
}

const env = { ...process.env, DATABASE_URL: databaseUrl };
const migrationFile = "prisma/migrations/20260629000100_init/migration.sql";

if (command === "setup") {
  if (!(await schemaInitialized(databaseUrl))) {
    await run("npm", ["exec", "prisma", "--", "db", "execute", "--file", migrationFile], env);
  }
  await run("node", ["dist/prisma/seed.js"], env);
} else {
  await run("npm", ["exec", "prisma", "--", "db", "execute", "--stdin"], env, "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await run("npm", ["exec", "prisma", "--", "db", "execute", "--file", migrationFile], env);
  await run("node", ["dist/prisma/seed.js"], env);
}

async function schemaInitialized(url: string): Promise<boolean> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ exists: boolean }>("SELECT to_regclass('public.\"Project\"') IS NOT NULL AS exists");
    return result.rows[0]?.exists ?? false;
  } finally {
    await client.end();
  }
}

function run(binary: string, args: string[], env: NodeJS.ProcessEnv, stdin?: string): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(binary, args, {
      cwd: packageRoot,
      env,
      stdio: stdin === undefined ? "inherit" : ["pipe", "inherit", "inherit"]
    });
    if (stdin !== undefined) {
      if (!child.stdin) {
        rejectRun(new Error("Child process stdin is not available."));
        return;
      }
      child.stdin.end(stdin);
    }
    child.on("error", rejectRun);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${binary} ${args.join(" ")} failed with exit code ${exitCode ?? "unknown"}.`));
      }
    });
  });
}
