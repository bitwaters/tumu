## Context

The backend foundation now has a TypeScript HTTP API, Prisma schema, migration SQL, seed data, Docker Compose PostgreSQL, and tests for auth, permissions, workflow, photo gallery, notifications, audit, and idempotency. Runtime handlers still use `createStore()` arrays as the source of truth, which means data is lost on restart and several database constraints are only mirrored manually.

This change keeps the existing endpoint contract stable while moving runtime reads and writes to PostgreSQL through Prisma.

## Goals / Non-Goals

**Goals:**

- Make Prisma/PostgreSQL the authoritative runtime storage for API handlers.
- Preserve existing endpoints, request bodies, response shapes, status semantics, and role permissions.
- Keep site-item creation, workflow transitions, photo binding, notifications, audit logs, and idempotency atomic.
- Add repeatable PostgreSQL-backed integration tests for the current API contract.
- Keep seed data and test fixtures aligned with the existing prototype users and site items.
- Leave a small reference/mock path only where it helps tests or seed generation.

**Non-Goals:**

- Redesign the API surface or frontend contract.
- Add new business features such as export workers, scheduled reminders, backup monitors, or external notifications.
- Replace the lightweight HTTP router with a larger framework.
- Implement Prisma persistence for large binary objects; MinIO/S3 remains responsible for object bytes.
- Solve multi-project company-wide tenancy beyond the current single-project model.

## Decisions

### Use a repository/service layer instead of querying Prisma directly in every route

Route handlers SHALL call focused service/repository functions for auth, users, master data, drawings, site items, photos, notifications, audit, and idempotency. This keeps Prisma include/select mapping, transaction composition, and frontend payload shaping out of the router.

Alternative considered: inline Prisma calls in `routes.ts`. Rejected because `routes.ts` is already broad, and direct inline queries would duplicate authorization filters and response mapping.

### Keep API response shapes stable with explicit mappers

Prisma records do not naturally match the current API payloads. For example, users expose `sectionScopeIds`, site item detail groups photos by stage, and drawing list returns `currentRevision`. The persistence layer SHALL use explicit mappers so the frontend contract remains stable while database joins can change internally.

Alternative considered: return raw Prisma objects. Rejected because that would leak relation shape changes into the frontend and weaken compatibility with the frozen UI prototype.

### Wrap multi-record writes in Prisma transactions

The current `withStoreTransaction` snapshot mechanism SHALL be replaced by Prisma `$transaction` for writes that touch more than one table. Required transactional paths include site-item creation, workflow transitions, photo binding, notification creation, audit log creation, and idempotency record writes.

Alternative considered: rely on sequential Prisma writes. Rejected because partial writes would recreate the same class of bugs already found in the in-memory implementation.

### Preserve idempotency semantics in the database

The idempotency service SHALL query and write `IdempotencyRecord` inside the same logical write path. Identical retries return the persisted response body; mismatched retries return 409. Unique keys are enforced by the database schema and handled consistently.

### Use a real PostgreSQL test path

Integration tests SHALL be able to run against a disposable PostgreSQL database/schema seeded before each test suite. Unit tests can still use pure functions where appropriate, but persistence behavior must be verified against the real database constraints.

Alternative considered: keep all tests on in-memory arrays. Rejected because the purpose of this change is database correctness.

## Risks / Trade-offs

- [Risk] Prisma Client 7 runtime requires explicit connection configuration in some paths → Mitigation: centralize PrismaClient creation and test startup so failures happen early.
- [Risk] Response mapping becomes verbose → Mitigation: keep small mapper functions near repositories and cover payloads with integration tests.
- [Risk] Transactions and idempotency can deadlock or duplicate work under retry storms → Mitigation: use unique idempotency keys, bounded transaction scopes, and deterministic replay responses.
- [Risk] Tests become slower with PostgreSQL → Mitigation: keep a smaller number of high-value integration tests and reuse migrated/seeded fixtures where possible.
- [Risk] Existing seed SQL and Prisma Client seed can drift → Mitigation: make one seed path authoritative and document how to run it locally.

## Migration Plan

1. Add Prisma client lifecycle utilities and repository/service interfaces without changing route URLs.
2. Implement read repositories and mappers for auth/current user, master data, drawings, photos, site items, notifications, and audit.
3. Replace write paths with Prisma transactions, starting with auth/user/master data, then photos, then site-item workflow.
4. Move idempotency storage from in-memory array to database records.
5. Convert tests to run against seeded PostgreSQL while preserving current behavior assertions.
6. Remove or quarantine runtime use of `createStore()` after all routes are database-backed.

Rollback during development is straightforward: keep the current in-memory implementation available until parity tests pass, then switch route construction to the Prisma-backed services.

## Open Questions

- Whether tests should use a separate PostgreSQL database name or separate schemas per run.
- Whether Prisma Client 7 should use the generated JS client directly or an official driver adapter if runtime writes require it.
- Whether `createStore()` should remain as seed-source data or be replaced by a static JSON fixture after migration.
