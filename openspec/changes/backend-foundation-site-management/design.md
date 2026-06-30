## Context

The repository now contains a stabilized React/Vite frontend prototype and frontend contract documentation, but no production backend. The v1 development document requires a field-facing system where workflow state, role permissions, photo evidence, audit logs, and idempotent writes are enforced on the server, not only by the UI.

The backend foundation must preserve the frontend domain semantics while preparing for later export generation, scheduled reminders, PDF creation, backup checks, and production deployment.

## Goals / Non-Goals

**Goals:**

- Create a TypeScript API app with a clear module boundary for auth, users, master data, drawings, site items, photos, notifications, audit logs, and health checks.
- Model the v1 domain in PostgreSQL through Prisma with migrations and seed data.
- Enforce server-side role, organization, and section-scope permissions for all list, detail, workflow, photo, notification, and audit APIs.
- Implement idempotency for write endpoints that can be retried in weak network conditions.
- Provide local Docker Compose infrastructure for PostgreSQL, Redis, MinIO, API, and Web.
- Keep response fields and workflow semantics aligned with `docs/frontend-contracts.md`.

**Non-Goals:**

- Full production export generation for Excel, photo packages, and PDFs.
- Complete scheduled reminder engine and backup monitor implementation.
- External notification channels such as enterprise WeChat, DingTalk, SMS, or email.
- Full offline sync.
- BIM/CAD/DWG parsing or external drawing-system integration.
- Production hardening such as WAF, SSO, key rotation, or multi-project company-wide tenancy.

## Decisions

### Use Fastify-style modular API with Prisma

The API SHOULD be implemented as a TypeScript Node.js service with explicit modules and route groups. Fastify is preferred for a compact API surface and good performance, while NestJS remains acceptable if the implementation needs stronger dependency-injection conventions.

Alternative considered: start with a full NestJS enterprise skeleton. Rejected for the foundation milestone because the immediate need is a small, testable API matching the frontend contract without framework ceremony.

### PostgreSQL is the source of truth

All durable domain objects SHALL live in PostgreSQL and be described in Prisma schema/migrations. Mock frontend data is used only as seed inspiration, not as runtime state.

Alternative considered: keep JSON/in-memory backend state for speed. Rejected because the next milestone must validate permissions, audit logs, and idempotency against persistent data.

### Server-side authorization is mandatory

Every backend service method that returns or mutates scoped resources MUST receive the current user context and apply the same access rules consistently:

- admin can access all project data;
- supervisor can access authorized sections;
- contractor manager can access items for their organization and authorized sections;
- rectifier can access assigned items in authorized sections.

Workflow ownership is explicit: dispatch, close, void, and reopen are owner-side actions. A workflow owner is the site item creator or an administrator/supervisor with access to the item's section; contractor managers and rectifiers are never workflow owners for closure authority.

Frontend-hidden buttons are not a security boundary. Workflow writes must re-read the latest item state in the same request path before applying a transition.

### Idempotency wraps all retryable writes

Write endpoints that create records, transition workflows, bind photos, or create tasks MUST require or accept `Idempotency-Key`. The server stores actor, method, path, key, request hash, response status, and response body. Repeated identical requests return the stored response; repeated mismatched bodies return 409.

### Photo upload is a two-step lifecycle

The foundation introduces `POST /photos/presign` and `POST /photos/complete` semantics. Completion creates an unbound photo in the current user's personal gallery. Later form actions bind selected photo IDs to items and write section/area/discipline/responsible-organization snapshots.

Alternative considered: upload directly during item creation. Rejected because the frontend workflow has settled on personal gallery first, then bind from create/rectification/review forms.

### Redis and MinIO are included as infrastructure, but advanced jobs are deferred

Redis and MinIO SHALL be included in local infrastructure so the API can develop against realistic dependencies. This foundation may add minimal queue/storage wrappers, but PDF generation, Excel export workers, and scheduled reminders belong to later changes.

## Risks / Trade-offs

- [Risk] Backend contract drifts from frontend prototype → Mitigation: use `docs/frontend-contracts.md` and shared TypeScript-style naming as acceptance input.
- [Risk] Authorization checks are duplicated across modules → Mitigation: centralize access helpers and require service methods to call them before querying or mutating scoped data.
- [Risk] Workflow transitions race under concurrent requests → Mitigation: re-read item state before transition and use transactional updates for workflow logs and item status.
- [Risk] Idempotency stores stale or large response bodies → Mitigation: keep records to 24 hours and store normalized JSON responses only.
- [Risk] MinIO/Redis increase setup complexity → Mitigation: provide Docker Compose defaults and health checks so local setup remains one command.

## Migration Plan

1. Add API workspace and shared backend scripts without changing the existing frontend runtime.
2. Add Prisma schema, initial migration, seed data, and database client.
3. Add Docker Compose services for PostgreSQL, Redis, MinIO, API, and Web.
4. Implement auth/current-user context and route-level authorization.
5. Implement user, master-data, drawing, and site-item workflow APIs.
6. Implement photo upload completion and binding APIs.
7. Add notification/audit foundations and tests.

Rollback is simple during this milestone: stop the API and infrastructure services, and continue using the existing frontend mock prototype. No production data migration is involved until the backend is explicitly adopted.

## Open Questions

- Whether the API should choose Fastify directly or NestJS with Fastify adapter before implementation starts.
- Whether authentication tokens should initially be signed JWTs only or server-backed sessions stored in Redis.
- Whether object-storage preview URLs should be returned as short-lived presigned URLs or proxied through the API in the first implementation.
