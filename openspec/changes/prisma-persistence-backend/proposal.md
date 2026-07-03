## Why

The backend foundation now exposes the v1 API contract, but runtime state is still served from an in-memory store. The next milestone is to make PostgreSQL/Prisma the actual source of truth so workflow closure, photo binding, idempotency, audit logs, and role-scoped queries survive process restarts and match the database schema already in the project.

## What Changes

- Replace in-memory route mutations and queries with Prisma-backed repository/service functions.
- Preserve existing API endpoints, response shapes, authorization semantics, and idempotency behavior.
- Add request-scoped Prisma transaction boundaries for site-item creation, workflow transitions, photo binding, notifications, audit logs, and idempotency records.
- Keep seed data aligned with current prototype users, master data, sample items, photos, logs, notifications, exports, and audit records.
- Add a test database workflow so integration tests can run against real PostgreSQL while remaining repeatable.
- Retain a small, explicit mapping layer between Prisma records and frontend-facing payloads, especially for user section scopes, grouped photos, workflow logs, allowed actions, and drawing revisions.

## Capabilities

### New Capabilities

- `prisma-persistence-runtime`: Database-backed runtime repositories, transactions, seed parity, and real PostgreSQL integration tests for the existing backend API contract.

### Modified Capabilities

- None.

## Impact

- Affects `apps/api/src` route handlers, auth helpers, workflow/photo/idempotency/audit paths, and tests.
- Uses the existing Prisma schema, migration, seed workflow, and Docker Compose PostgreSQL service.
- Does not change frontend pages or API endpoint names.
- Reduces reliance on `createStore()` to tests and seed/reference data only.
