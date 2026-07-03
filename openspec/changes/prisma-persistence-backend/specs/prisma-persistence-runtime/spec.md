## ADDED Requirements

### Requirement: PostgreSQL-backed API runtime
The backend API SHALL use Prisma/PostgreSQL as the runtime source of truth for durable domain data instead of the in-memory store.

#### Scenario: Data survives API restart
- **WHEN** a user creates or updates a durable record through the API and the API process restarts
- **THEN** the record remains available from PostgreSQL-backed API reads

#### Scenario: In-memory store is not used for production route state
- **WHEN** the API handles auth, users, master data, drawings, site items, photos, notifications, audit logs, or idempotency records
- **THEN** the handler reads and writes through Prisma-backed services rather than mutating `createStore()` arrays

### Requirement: Stable API payload mapping
The backend API SHALL preserve the existing frontend-facing request and response contract while mapping database relations explicitly.

#### Scenario: User payload includes section scopes
- **WHEN** a client requests the current user or user list
- **THEN** each returned user includes `sectionScopeIds` and excludes `passwordHash`

#### Scenario: Site item detail payload keeps grouped fields
- **WHEN** a client requests `GET /site-items/:id`
- **THEN** the response includes grouped photos by stage, workflow logs, and allowed actions using the same field names as the in-memory implementation

#### Scenario: Drawing payload keeps current revision
- **WHEN** a client requests the drawing list
- **THEN** each drawing includes its current revision using the current API response shape

### Requirement: Transactional durable writes
The backend API SHALL commit multi-record writes atomically through Prisma transactions.

#### Scenario: Site item creation rolls back on photo binding failure
- **WHEN** item creation includes at least one invalid discovery photo
- **THEN** no site item, workflow log, audit log, or partial photo binding is committed

#### Scenario: Workflow transition rolls back on failure
- **WHEN** a workflow transition fails after attempting to change status, bind photos, create notifications, create workflow logs, or create audit logs
- **THEN** all records touched by that transition remain unchanged

#### Scenario: Idempotent write replay is database-backed
- **WHEN** a client retries a write request with the same actor, method, path, idempotency key, and request body
- **THEN** the API returns the original persisted response body without applying the write a second time

### Requirement: Database-enforced authorization and constraints
The backend API SHALL apply existing role, section, organization, workflow-owner, and photo ownership rules using database-backed queries and database constraints.

#### Scenario: Scoped list query
- **WHEN** a contractor manager or rectifier lists site items or photos
- **THEN** the API returns only records visible to that user according to section scope, organization, assignment, and photo ownership rules

#### Scenario: Invalid responsibility assignment
- **WHEN** an item create or dispatch request references an inactive organization, non-contractor organization, non-rectifier user, cross-organization user, or user outside the item section scope
- **THEN** the API rejects the request and commits no partial changes

#### Scenario: Unique user fields match database constraints
- **WHEN** an administrator creates or updates a user with an existing username or phone number
- **THEN** the API rejects the request before or consistently with database unique constraint failure

### Requirement: PostgreSQL-backed test workflow
The project SHALL provide repeatable backend verification against a real local PostgreSQL database.

#### Scenario: Fresh database setup
- **WHEN** a developer runs the documented database migration and seed commands against a fresh local PostgreSQL service
- **THEN** migrations apply successfully and seed data creates the prototype project, users, master data, items, photos, logs, notifications, exports, and audit records

#### Scenario: Integration tests use durable storage
- **WHEN** backend integration tests run for auth, users, master data, drawings, site item workflow, photo gallery, notifications, audit, and idempotency
- **THEN** the tests exercise Prisma/PostgreSQL persistence rather than only in-memory arrays
