## 1. Prisma Runtime Foundation

- [x] 1.1 Add a Prisma client lifecycle module that reads existing API config and exposes connect/disconnect helpers.
- [x] 1.2 Decide and implement the Prisma Client 7 connection mode required for runtime queries, including any official driver adapter if needed.
- [x] 1.3 Add repository/service module folders for auth, users, master data, drawings, site items, photos, notifications, audit, and idempotency.
- [x] 1.4 Add shared mapper helpers for public users, user section scopes, drawing current revision, site item detail, grouped photos, workflow logs, and allowed actions.
- [x] 1.5 Keep `createStore()` available only as seed/reference data while preventing production route construction from depending on it.

## 2. Database Test Harness

- [x] 2.1 Add documented test database environment variables and npm scripts for PostgreSQL-backed API tests.
- [x] 2.2 Add a test setup helper that applies migrations and loads seed data before integration tests.
- [x] 2.3 Add a test teardown/reset strategy that keeps tests repeatable without depending on manual Docker cleanup.
- [ ] 2.4 Convert the route test harness to construct the API with Prisma-backed services.
- [x] 2.5 Keep fast unit tests for pure authorization and mapper helpers where useful.

## 3. Read Path Migration

Route wiring remains tracked by 2.4 and contract parity remains tracked by section 6; these completed items cover repository/service implementation only.

- [x] 3.1 Implement auth repository/service lookup for username/phone login and current-user token resolution.
- [x] 3.2 Implement user repository/service payload mapping with `sectionScopeIds` and hidden password hashes.
- [x] 3.3 Implement master-data repository/service list queries with active-state and role/section/organization scoping.
- [x] 3.4 Implement drawing repository/service list, revision list, page list, preview lookup, and current-version mapping with authorization.
- [x] 3.5 Implement site-item repository/service list and detail queries with search, filters, overdue filtering, scoped visibility, grouped photos, logs, and allowed actions.
- [x] 3.6 Implement photo repository/service gallery and preview lookup queries with ownership and item-visibility checks.
- [x] 3.7 Implement notification repository/service list/unread-count and audit-log query reads.

## 4. Write Path Migration

Route wiring remains tracked by 2.4 and contract parity remains tracked by section 6; these completed items cover repository/service implementation only.

- [x] 4.1 Implement repository/service login audit, logout audit, user create/update/disable/reset-password, and user-scope writes.
- [x] 4.2 Implement repository/service master-data create/update writes with admin-only authorization and audit logging.
- [x] 4.3 Implement repository/service drawing create/update, revision upload metadata, page creation, and set-current writes with audit logging.
- [ ] 4.4 Implement photo presign/complete/delete writes with personal-gallery ownership and idempotency.
- [ ] 4.5 Implement site-item create/edit writes with responsibility validation, discovery photo binding, workflow log, audit log, and idempotency.
- [ ] 4.6 Implement dispatch, assign-rectifier, start-rectify, submit-review, close, void, reopen, and comment workflow transitions.
- [ ] 4.7 Implement notification creation and audit creation inside workflow transactions.

## 5. Transactions And Idempotency

- [ ] 5.1 Replace `withStoreTransaction` runtime use with Prisma `$transaction` for all multi-record writes.
- [ ] 5.2 Move idempotency lookup, request-hash comparison, response replay, conflict detection, and record creation to PostgreSQL.
- [ ] 5.3 Ensure identical retries return the original response body and mismatched retries return 409 without applying mutations.
- [ ] 5.4 Add tests for failed item creation rollback, failed workflow rollback, and idempotent replay against PostgreSQL.

## 6. Contract Parity Verification

- [ ] 6.1 Port auth/current-user tests to PostgreSQL-backed services.
- [ ] 6.2 Port user and master-data permission tests to PostgreSQL-backed services.
- [ ] 6.3 Port drawing visibility, revision, page, preview, and current-version tests to PostgreSQL-backed services.
- [ ] 6.4 Port site-item list/detail/create/edit/workflow tests to PostgreSQL-backed services.
- [ ] 6.5 Port photo gallery, binding, preview, and delete tests to PostgreSQL-backed services.
- [ ] 6.6 Port notification, unread-count, audit query, and idempotency tests to PostgreSQL-backed services.
- [ ] 6.7 Add restart persistence verification showing a created durable record remains after reconstructing the API service.

## 7. Cleanup And Documentation

- [ ] 7.1 Remove or quarantine in-memory route runtime code once Prisma-backed parity tests pass.
- [ ] 7.2 Update backend setup docs with the PostgreSQL-backed test workflow and any required Prisma Client adapter notes.
- [ ] 7.3 Run Prisma generate, migration, seed, typecheck, build, PostgreSQL-backed tests, and OpenSpec strict validation.
- [ ] 7.4 Confirm no API endpoint names, request body fields, or frontend-facing response shapes changed unexpectedly.
