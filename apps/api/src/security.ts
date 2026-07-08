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

export interface TokenPayload {
  sub: string;
  pwd?: string;
  exp: number;
}

export function issueToken(userId: string, config: ApiConfig, passwordHash?: string): string {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const issuedAt = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(60, Math.floor(config.jwtTtlHours * 60 * 60));
  const payload = encodeJson({
    sub: userId,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    pwd: passwordHash ? stableHash(passwordHash) : undefined
  });
  const data = `${header}.${payload}`;
  return `${data}.${sign(data, config.jwtSecret)}`;
}

export function verifyTokenPayload(token: string, config: ApiConfig, nowMs = Date.now()): TokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized();
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`, config.jwtSecret);
  if (!safeEqualString(signature, expected)) throw unauthorized();
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; pwd?: string; exp?: number };
    if (!parsed.sub || typeof parsed.exp !== "number") throw unauthorized();
    if (parsed.exp <= Math.floor(nowMs / 1000)) throw unauthorized();
    return { sub: parsed.sub, pwd: parsed.pwd, exp: parsed.exp };
  } catch {
    throw unauthorized();
  }
}

export function verifyToken(token: string, config: ApiConfig): string {
  return verifyTokenPayload(token, config).sub;
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function safeEqualString(actualValue: string, expectedValue: string): boolean {
  const actual = Buffer.from(actualValue);
  const expected = Buffer.from(expectedValue);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
