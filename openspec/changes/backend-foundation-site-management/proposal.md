## Why

The frontend prototype has stabilized the field workflow and role-specific UI, but the system still relies on mock state. The next milestone is to build the backend foundation so item closure, photo binding, permissions, idempotency, and audit behavior are enforced server-side before deeper export and notification features are implemented.

## What Changes

- Add a Node.js TypeScript API application scaffold under `apps/api`.
- Add PostgreSQL persistence through Prisma for project, master data, users, section scopes, site items, photos, workflow logs, notifications, audit logs, and idempotency records.
- Add authentication endpoints and token-based current-user context.
- Add server-side role, organization, and section-scope authorization helpers shared by all list/detail/write APIs.
- Add foundational site-item workflow APIs for create, dispatch, assign rectifier, start rectification, submit review, close, void, reopen, and comments.
- Add photo upload record APIs that support presign/complete semantics, personal gallery filtering, and item-stage binding.
- Add user-management, master-data, and drawing-management APIs needed by the frozen desktop administration pages.
- Add notification and audit-log foundations needed by workflow actions.
- Add Docker Compose infrastructure for PostgreSQL, Redis, MinIO, API, and Web local deployment.
- Add backend tests for permissions, workflow transitions, idempotency, and scoped queries.

## Capabilities

### New Capabilities

- `backend-app-foundation`: API app scaffold, environment configuration, health checks, Docker Compose services, and shared backend conventions.
- `auth-and-authorization`: Login, current user, role permissions, organization scope, section scope, and server-side access filtering.
- `user-management-api`: Administrator user list, create, update, disable, reset-password, and section-scope assignment APIs.
- `master-data-api`: Section, organization, area, and discipline list/create/update APIs with active-state filtering.
- `core-data-model`: PostgreSQL/Prisma schema and seed data for project, sections, organizations, users, scopes, areas, disciplines, drawings, items, photos, logs, notifications, exports, audit logs, and idempotency records.
- `drawing-management-api`: Drawing archive list/create, revision upload, revision pages, preview access, and current-version switching.
- `site-item-workflow-api`: Site item list/detail/create/edit and workflow transition APIs aligned with the frozen frontend contract.
- `photo-storage-api`: Photo upload lifecycle, personal gallery, preview access, and item-stage binding using S3-compatible object storage.
- `notification-audit-foundation`: Workflow notifications, read state, audit logging, and query foundations.

### Modified Capabilities

- None.

## Impact

- Adds `apps/api` and backend package scripts.
- Adds Prisma schema, migrations, seed data, and generated client workflow.
- Adds local infrastructure under `infra/` for PostgreSQL, Redis, MinIO, and API/Web orchestration.
- Frontend contracts in `docs/frontend-contracts.md` and `docs/site-management-v1-dev.md` become backend implementation inputs.
- Future export, PDF, reminder scheduling, backup, and production deployment changes will build on this backend foundation.
