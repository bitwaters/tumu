## ADDED Requirements

### Requirement: Site item list and detail APIs
The API SHALL expose site item list and detail endpoints with server-side filters and authorization.

#### Scenario: List site items
- **WHEN** an authenticated user calls `GET /site-items` with filters
- **THEN** the API returns only authorized items matching status, type, severity, section, area, discipline, organization, overdue, and search filters

#### Scenario: Get item detail
- **WHEN** an authenticated user calls `GET /site-items/:id` for an authorized item
- **THEN** the API returns item fields, grouped photos, workflow logs, comments, and allowed actions

#### Scenario: Unauthorized item detail
- **WHEN** a user requests an item outside their authorization scope
- **THEN** the API returns 404 or 403 without leaking item details

### Requirement: Create and edit site items
The API SHALL allow authorized administrators and supervisors to create and edit open site items.

#### Scenario: Create site item
- **WHEN** an authorized creator submits a valid item payload with an idempotency key
- **THEN** the API creates a pending approval item, assigns an item number, binds selected discovery photos, writes WorkflowLog, and returns the new item

#### Scenario: Edit open item
- **WHEN** an authorized user edits an item that is not closed or voided
- **THEN** the API updates editable basic fields and writes audit metadata

#### Scenario: Edit closed item rejected
- **WHEN** a user attempts to edit a closed item through the basic edit endpoint
- **THEN** the API rejects the request

### Requirement: Workflow transition APIs
The API SHALL expose workflow transition endpoints for dispatch, assign rectifier, start rectification, submit review, close, void, reopen, and comments.

#### Scenario: Dispatch item
- **WHEN** a workflow owner dispatches a pending item to an active contractor organization
- **THEN** the item status becomes dispatched, responsible organization is set, and logs/notifications are created

#### Scenario: Start rectification
- **WHEN** an assigned rectifier starts a dispatched item
- **THEN** the item status becomes rectifying and a workflow log is created

#### Scenario: Submit review with photos
- **WHEN** an assigned rectifier submits a rectifying item for review with selected rectification photo IDs
- **THEN** the item status becomes pending acceptance, photos are bound as rectification evidence, and the site item creator plus eligible workflow owners receive notifications

#### Scenario: Close item
- **WHEN** a workflow owner closes a pending acceptance item
- **THEN** the item status becomes closed, closedAt is set, review photos can be bound, and workflow/audit logs are written

#### Scenario: Void item
- **WHEN** a workflow owner voids an item that is not closed
- **THEN** the item status becomes voided, voidedAt is set, and workflow/audit logs are written

#### Scenario: Reopen item
- **WHEN** a workflow owner reopens a closed or voided item
- **THEN** the item returns to rectifying, dispatched, or pending approval based on valid responsibility fields and logs/notifications are created

### Requirement: Workflow consistency
The API MUST apply item status changes and workflow log writes transactionally.

#### Scenario: Workflow update succeeds atomically
- **WHEN** a valid workflow transition is processed
- **THEN** item status, timestamps, photo bindings, workflow logs, notifications, and audit logs are committed together

#### Scenario: Invalid transition rejected
- **WHEN** a workflow transition does not match the latest item status
- **THEN** the API rejects the request without partial updates
