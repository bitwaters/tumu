## ADDED Requirements

### Requirement: Prisma schema covers v1 domain
The backend SHALL define a Prisma schema for the v1 domain objects described in the development document and frontend contracts.

#### Scenario: Core models exist
- **WHEN** a developer inspects the Prisma schema
- **THEN** it includes Project, Section, Organization, User, UserSectionScope, Area, Discipline, Drawing, DrawingRevision, DrawingRevisionPage, SiteItem, PhotoAttachment, WorkflowLog, Notification, ExportJob, AuditLog, and IdempotencyRecord

#### Scenario: Enums match frontend contract
- **WHEN** the API serializes site item status, item type, severity, role, photo stage, workflow action, and notification type
- **THEN** enum values match the frontend contract names

### Requirement: Migrations and seed data
The backend SHALL provide reproducible database migrations and seed data aligned with the frontend prototype.

#### Scenario: Fresh database initialization
- **WHEN** a developer runs migration and seed commands on an empty PostgreSQL database
- **THEN** the database contains a project, sections, organizations, users, scopes, areas, disciplines, sample items, photos, logs, notifications, exports, and audit data sufficient for local testing

#### Scenario: Seeded users support role testing
- **WHEN** seed data is loaded
- **THEN** administrator, supervisor, contractor manager, and rectifier users are available

### Requirement: Idempotency records
The backend SHALL persist idempotency records for retryable write requests.

#### Scenario: Duplicate identical request
- **WHEN** the same actor repeats a write request with the same method, path, idempotency key, and request body
- **THEN** the API returns the original response without creating duplicate records

#### Scenario: Duplicate mismatched request
- **WHEN** the same actor repeats a write request with the same method, path, and idempotency key but a different request body
- **THEN** the API returns 409 and does not perform the second write

### Requirement: Referential integrity
The database SHALL enforce relationships required for permissions, workflow history, photo binding, and audit records.

#### Scenario: Item references valid master data
- **WHEN** a site item is created
- **THEN** its project, section, area, discipline, creator, and optional responsible organization/user references must be valid

#### Scenario: Workflow log is append-only
- **WHEN** a workflow action is recorded
- **THEN** a WorkflowLog row is created without deleting previous workflow history
