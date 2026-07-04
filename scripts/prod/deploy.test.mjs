import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { rejects, ok, equal } from "node:assert/strict";
import { test } from "node:test";

const execFileAsync = promisify(execFile);

async function runDeploy(args, dir) {
  return execFileAsync("sh", ["scripts/prod/deploy.sh", ...args], {
    cwd: new URL("../..", import.meta.url).pathname,
    env: {
      ...process.env,
      DEPLOY_DRY_RUN: "true",
      ENV_FILE: join(dir, ".env.production"),
      COMPOSE_FILE: join(dir, "docker-compose.yml")
    }
  });
}

test("dry-run first deploy initializes env and redacts smoke password", async () => {
  const dir = await mkdtemp(join(tmpdir(), "site-deploy-first-"));

  const { stdout } = await runDeploy(["--host", "site.local", "--smoke-password", "secret-value", "--backup-dir", "/backup"], dir);

  ok(stdout.includes("init-env.mjs --output"));
  ok(stdout.includes("--host site.local"));
  ok(stdout.includes("--smoke-password ***"));
  equal(stdout.includes("secret-value"), false);
  ok(stdout.includes("preflight.sh"));
  ok(stdout.includes("docker compose"));
  ok(stdout.includes(" build"));
  ok(stdout.includes(" up -d"));
  ok(stdout.includes("migrate.sh"));
  ok(stdout.includes(" ps"));
  ok(stdout.includes("smoke.mjs"));
});

test("dry-run existing env preserves production secrets and skips init", async () => {
  const dir = await mkdtemp(join(tmpdir(), "site-deploy-existing-"));
  await writeFile(join(dir, ".env.production"), "already=true\n");

  const { stdout } = await runDeploy(["--host", "ignored.local"], dir);

  ok(stdout.includes("Using existing environment file"));
  equal(stdout.includes("init-env.mjs"), false);
  ok(stdout.includes("preflight.sh"));
});

test("dry-run can skip smoke validation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "site-deploy-skip-smoke-"));
  await writeFile(join(dir, ".env.production"), "already=true\n");

  const { stdout } = await runDeploy(["--skip-smoke"], dir);

  ok(stdout.includes("Skipping production smoke validation"));
  equal(stdout.includes("smoke.mjs"), false);
});

test("deploy requires host when env file is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "site-deploy-missing-host-"));

  await rejects(() => runDeploy([], dir), /does not exist/);
});
