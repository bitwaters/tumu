import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Command = "setup" | "reset";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] as Command | undefined;
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (command !== "setup" && command !== "reset") {
  throw new Error("Usage: node dist/prisma/testDatabase.js <setup|reset>");
}

if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL or DATABASE_URL is required for database test setup.");
}

if (command === "reset" && !process.env.TEST_DATABASE_URL && process.env.ALLOW_DATABASE_RESET !== "true") {
  throw new Error("Refusing to reset DATABASE_URL. Set TEST_DATABASE_URL, or set ALLOW_DATABASE_RESET=true explicitly.");
}

const env = { ...process.env, DATABASE_URL: databaseUrl };

if (command === "setup") {
  await run("npm", ["exec", "prisma", "--", "migrate", "deploy", "--schema", "prisma/schema.prisma"], env);
  await run("node", ["dist/prisma/seed.js"], env);
} else {
  await run("npm", ["exec", "prisma", "--", "migrate", "reset", "--force", "--skip-seed", "--schema", "prisma/schema.prisma"], env);
  await run("node", ["dist/prisma/seed.js"], env);
}

function run(binary: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(binary, args, {
      cwd: packageRoot,
      env,
      stdio: "inherit"
    });
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
