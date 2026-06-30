## 1. Backend Workspace And Infrastructure

- [x] 1.1 Create `apps/api` TypeScript Node.js workspace with development, build, test, lint/typecheck, and start scripts.
- [x] 1.2 Add API environment configuration for server port, database URL, Redis URL, object storage endpoint, JWT/session secret, and upload limits.
- [x] 1.3 Add `GET /health` and `GET /ready` endpoints with dependency readiness checks.
- [x] 1.4 Add Docker Compose services for PostgreSQL, Redis, MinIO, API, and Web with stable local ports.
- [x] 1.5 Add root package scripts for API dev/build/test, Prisma generate/migrate/seed, and infrastructure up/down.

## 2. Prisma Data Model

- [x] 2.1 Add Prisma schema with enums aligned to frontend contract values.
- [x] 2.2 Add Project, Section, Organization, User, UserSectionScope, Area, and Discipline models.
- [x] 2.3 Add Drawing, DrawingRevision, and DrawingRevisionPage models.
- [x] 2.4 Add SiteItem, PhotoAttachment, WorkflowLog, Notification, ExportJob, AuditLog, and IdempotencyRecord models.
- [x] 2.5 Add initial migration and generated Prisma client.
- [x] 2.6 Add seed data matching the prototype roles, master data, sample items, photos, logs, notifications, exports, and audit records.

## 3. Auth And Authorization

- [x] 3.1 Implement password hashing and login credential verification.
- [x] 3.2 Implement token issuance, authenticated request context, logout placeholder, and `GET /auth/me`.
- [x] 3.3 Implement centralized access helpers for admin, supervisor, contractor manager, rectifier, section scope, and organization scope.
- [x] 3.4 Apply authorization helpers to user, master-data, item, photo, notification, and audit service queries.
- [x] 3.5 Add tests for role visibility and forbidden access across all four roles.

## 4. Idempotency And API Conventions

- [x] 4.1 Add request validation utilities and consistent JSON error responses.
- [x] 4.2 Implement `Idempotency-Key` middleware or service wrapper for retryable write endpoints.
- [x] 4.3 Store actor, method, path, key, request hash, response status, response body, createdAt, and expiresAt.
- [x] 4.4 Return original responses for identical retries and 409 for mismatched retries.
- [x] 4.5 Add tests for duplicate create, duplicate photo complete, and duplicate workflow action submissions.

## 5. Master Data APIs

- [x] 5.1 Implement section, organization, area, and discipline list endpoints with active-state filtering.
- [x] 5.2 Implement create/update endpoints for section, organization, area, and discipline with admin-only writes.
- [x] 5.3 Implement user list/create/update/disable/reset-password endpoints with admin-only writes.
- [x] 5.4 Persist UserSectionScope assignments and return scopes in user responses.

## 6. Drawing Management APIs

- [x] 6.1 Implement `GET /drawings` with area, discipline, active-state, search, and authorization filters.
- [x] 6.2 Implement administrator-only drawing create/update endpoints with audit logging.
- [x] 6.3 Implement revision upload flow for PDF/image sources with object storage keys and DrawingRevisionPage records.
- [x] 6.4 Implement revision list, page list, preview, and set-current endpoints with authorization and audit logging.
- [x] 6.5 Add tests for drawing list visibility, admin-only writes, revision upload metadata, preview permissions, and current-version switching.

## 7. Site Item Workflow APIs

- [x] 7.1 Implement `GET /site-items` with search and filters for status, type, severity, section, area, discipline, organization, overdue, and scope.
- [x] 7.2 Implement `GET /site-items/:id` with grouped photos, workflow logs, comments, and allowed actions.
- [x] 7.3 Implement `POST /site-items` with item number generation, due date defaults, discovery photo binding, idempotency, WorkflowLog, AuditLog, and response payload.
- [x] 7.4 Implement `PATCH /site-items/:id` for editable open-item fields with authorization and audit logging.
- [x] 7.5 Implement dispatch and assign-rectifier transitions with responsibility validation, workflow-owner checks, logs, audit entries, and notifications.
- [x] 7.6 Implement start-rectify and submit-review transitions with latest-state checks, rectification photo binding, logs, audit entries, and notifications.
- [x] 7.7 Implement close, void, reopen, and comments endpoints with latest-state checks, workflow-owner checks, required comments where appropriate, logs, audit entries, and notifications.
- [x] 7.8 Wrap workflow transitions in database transactions so item status, photo bindings, logs, notifications, and audit entries commit atomically.

## 8. Photo Storage APIs

- [x] 8.1 Add S3-compatible object storage client for MinIO with non-guessable object key generation.
- [x] 8.2 Implement `POST /photos/presign` with MIME type and file size validation.
- [x] 8.3 Implement `POST /photos/complete` to create unbound personal-gallery PhotoAttachment records idempotently.
- [x] 8.4 Implement `GET /photos` for current-user gallery, unbound-only filtering, search, pagination, and newest-first sorting.
- [x] 8.5 Implement photo binding service that only binds current-user unbound photos to authorized items and writes metadata snapshots.
- [x] 8.6 Implement `GET /photos/:id/preview` with authorized short-lived preview access.
- [x] 8.7 Implement authorized photo deletion or delete marker with audit logging.

## 9. Notifications And Audit

- [x] 9.1 Implement notification creation helpers for assignment, review requested, voided, and reopened events.
- [x] 9.2 Implement notification list, unread-count, mark-read, and read-all endpoints scoped to current user.
- [x] 9.3 Implement audit log creation helper for auth, user writes, master-data writes, drawing writes, workflow actions, photo deletion, and export placeholders.
- [x] 9.4 Implement admin-only audit log query endpoint with user, time, resource type, and action filters.
- [x] 9.5 Add data fields needed for later due-soon and overdue reminder jobs.

## 10. Verification

- [x] 10.1 Run Prisma generate and migration on a fresh local database.
- [x] 10.2 Run seed data and confirm all four prototype roles can authenticate.
- [x] 10.3 Add unit tests for authorization helpers and workflow transition guards.
- [x] 10.4 Add integration tests for auth, users, master data, site item list/detail, create, dispatch, assign, submit review, close, void, reopen, and comments.
- [x] 10.5 Add integration tests for drawing list/create/revision/page/preview/current-version permissions.
- [x] 10.6 Add integration tests for photo presign/complete/gallery/binding/preview permissions.
- [x] 10.7 Add integration tests for notifications, unread counts, audit query permissions, and idempotency behavior.
- [x] 10.8 Run full API build/test workflow successfully.
- [x] 10.9 Document backend environment setup, local infrastructure startup, database migration, seed, and test commands.
