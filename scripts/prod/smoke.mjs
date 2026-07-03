import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(new URL("../..", import.meta.url).pathname);
const envFile = process.env.ENV_FILE ?? resolve(projectRoot, ".env.production");
loadDotEnv(envFile);

const apiBase = required("PUBLIC_API_BASE_URL").replace(/\/+$/, "");
const webBase = required("PUBLIC_WEB_BASE_URL").replace(/\/+$/, "");
const username = required("SMOKE_USERNAME");
const password = required("SMOKE_PASSWORD");

if (isPlaceholder(password)) fail("SMOKE_PASSWORD must be replaced with a production smoke account password.");

await expectOk(`${apiBase}/health`, "API health");
await expectOk(`${webBase}/health`, "Web health");

const login = await request("POST", "/auth/login", { username, password });
const token = login.accessToken;
if (!token) fail("Login response did not include an access token.");

const items = await request("GET", "/site-items", undefined, token);
if (!Array.isArray(items)) fail("Site item list response is not an array.");

const unread = await request("GET", "/notifications/unread-count", undefined, token);
if (typeof unread.count !== "number") fail("Notification unread count response is invalid.");

console.log(
  JSON.stringify(
    {
      ok: true,
      apiBase,
      webBase,
      siteItems: items.length,
      unreadNotifications: unread.count
    },
    null,
    2
  )
);

async function expectOk(url, label) {
  const response = await fetch(url);
  if (!response.ok) fail(`${label} check failed with HTTP ${response.status}.`);
}

async function request(method, path, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const message = parsed?.error?.message ?? parsed?.message ?? text;
    fail(`${method} ${path} failed with HTTP ${response.status}: ${message}`);
  }
  return parsed?.data;
}

function loadDotEnv(path) {
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function required(key) {
  const value = process.env[key];
  if (!value) fail(`Missing required environment value: ${key}`);
  return value;
}

function isPlaceholder(value) {
  return value.includes("CHANGE_ME") || ["password123", "admin123"].includes(value);
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
