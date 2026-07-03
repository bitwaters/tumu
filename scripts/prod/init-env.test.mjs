import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rejects, strictEqual, ok } from "node:assert/strict";
import { test } from "node:test";
import { buildEnv, run } from "./init-env.mjs";

function silentRuntime(cwd) {
  return {
    cwd,
    stdout: {
      write() {}
    }
  };
}

test("buildEnv requires a bare host and derives public URLs", () => {
  const content = buildEnv({ host: "10.0.0.8", apiHostPort: "4100", webHostPort: "8088", appImageTag: "release-1", postgresDb: "site", postgresUser: "site", postgresHostPort: "5432", s3Bucket: "bucket", minioApiHostPort: "9000", minioConsoleHostPort: "9001", uploadMaxBytes: "1000", idempotencyTtlHours: "24", backupDir: "/backup", smokeUsername: "smoke" });

  ok(content.includes("PUBLIC_API_BASE_URL=http://10.0.0.8:4100"));
  ok(content.includes("PUBLIC_WEB_BASE_URL=http://10.0.0.8:8088"));
  strictEqual(content.includes("CHANGE_ME"), false);
});

test("buildEnv rejects host values with protocols or paths", () => {
  rejects(async () => buildEnv({ host: "http://10.0.0.8", apiHostPort: "4000", webHostPort: "8080" }));
});

test("run writes env file and refuses accidental overwrite", async () => {
  const dir = await mkdtemp(join(tmpdir(), "site-env-"));
  await run(["--host", "site.local", "--output", "prod.env", "--smoke-password", "strong-smoke-password"], silentRuntime(dir));

  const content = await readFile(join(dir, "prod.env"), "utf8");
  ok(content.includes("PUBLIC_API_BASE_URL=http://site.local:4000"));
  ok(content.includes("SMOKE_PASSWORD=strong-smoke-password"));
  strictEqual(content.includes("CHANGE_ME"), false);

  await rejects(() => run(["--host", "site.local", "--output", "prod.env"], silentRuntime(dir)), /already exists/);
});

test("run supports force overwrite", async () => {
  const dir = await mkdtemp(join(tmpdir(), "site-env-force-"));
  const output = join(dir, "prod.env");
  await writeFile(output, "old=true\n");

  await run(["--host", "site.local", "--output", "prod.env", "--force"], silentRuntime(dir));

  const content = await readFile(output, "utf8");
  ok(content.includes("PUBLIC_WEB_BASE_URL=http://site.local:8080"));
  strictEqual(content.includes("old=true"), false);
});
