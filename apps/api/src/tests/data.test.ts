import { equal } from "node:assert/strict";
import { test } from "node:test";
import { demoPassword } from "../data.js";

test("demoPassword ignores blank specific seed passwords", () => {
  const previousDemo = process.env.SEED_DEMO_PASSWORD;
  const previousAdmin = process.env.SEED_ADMIN_PASSWORD;
  const previousUser = process.env.SEED_USER_PASSWORD;

  try {
    process.env.SEED_DEMO_PASSWORD = "shared-seed-password";
    process.env.SEED_ADMIN_PASSWORD = "";
    process.env.SEED_USER_PASSWORD = "   ";

    equal(demoPassword("admin"), "shared-seed-password");
    equal(demoPassword("user"), "shared-seed-password");

    process.env.SEED_ADMIN_PASSWORD = "admin-seed-password";
    process.env.SEED_USER_PASSWORD = "user-seed-password";

    equal(demoPassword("admin"), "admin-seed-password");
    equal(demoPassword("user"), "user-seed-password");
  } finally {
    restoreEnv("SEED_DEMO_PASSWORD", previousDemo);
    restoreEnv("SEED_ADMIN_PASSWORD", previousAdmin);
    restoreEnv("SEED_USER_PASSWORD", previousUser);
  }
});

function restoreEnv(name: "SEED_DEMO_PASSWORD" | "SEED_ADMIN_PASSWORD" | "SEED_USER_PASSWORD", value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
