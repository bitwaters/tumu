import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { ApiConfig } from "./config.js";
import { unauthorized } from "./errors.js";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const [algorithm, salt, expectedHash] = hash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHash) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("hex"));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function issueToken(userId: string, config: ApiConfig): string {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({ sub: userId, iat: Math.floor(Date.now() / 1000) });
  const data = `${header}.${payload}`;
  return `${data}.${sign(data, config.jwtSecret)}`;
}

export function verifyToken(token: string, config: ApiConfig): string {
  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized();
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`, config.jwtSecret);
  if (signature !== expected) throw unauthorized();
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string };
    if (!parsed.sub) throw unauthorized();
    return parsed.sub;
  } catch {
    throw unauthorized();
  }
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}
