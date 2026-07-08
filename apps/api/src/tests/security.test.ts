import { ok, throws } from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../config.js";
import { issueToken, verifyTokenPayload } from "../security.js";

test("issued JWTs expire and reject expired access", () => {
  const config = { ...loadConfig(), jwtTtlHours: 1 };
  const issuedAt = Date.now();
  const token = issueToken("user-1", config, "password-hash");
  const payload = verifyTokenPayload(token, config, issuedAt);

  ok(payload.exp > Math.floor(issuedAt / 1000));
  throws(() => verifyTokenPayload(token, config, issuedAt + 2 * 60 * 60 * 1000));
});

test("JWT verification rejects tampered signatures", () => {
  const config = loadConfig();
  const token = issueToken("user-1", config, "password-hash");
  const tampered = `${token.slice(0, -1)}x`;

  throws(() => verifyTokenPayload(tampered, config));
});
