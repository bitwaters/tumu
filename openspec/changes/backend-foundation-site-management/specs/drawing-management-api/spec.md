## ADDED Requirements

### Requirement: Drawing archive APIs
The API SHALL expose drawing archive endpoints for desktop administration and field reference.

#### Scenario: List drawings
- **WHEN** an authenticated user calls `GET /drawings` with optional area, discipline, active-state, or search filters
- **THEN** the API returns drawings visible within the user's project and section scope, including current revision summary when available

#### Scenario: Create drawing
- **WHEN** an administrator creates a drawing with name, code, area, discipline, and active state
- **THEN** the API stores the drawing and writes an audit log

#### Scenario: Non-admin drawing write rejected
- **WHEN** a non-admin user attempts to create or update drawing archive metadata
- **THEN** the API returns 403

### Requirement: Drawing revision APIs
The API SHALL support uploading and browsing drawing revisions without reintroducing issue-location point selection.

#### Scenario: Upload drawing revision
- **WHEN** an administrator uploads a PDF or image revision for an existing drawing
- **THEN** the API stores the source object, creates DrawingRevision and DrawingRevisionPage records, marks the revision current when requested, and writes an audit log

#### Scenario: List drawing revisions
- **WHEN** an authenticated user calls `GET /drawings/:id/revisions` for an authorized drawing
- **THEN** the API returns revisions ordered newest first with current-version status

#### Scenario: List revision pages
- **WHEN** an authenticated user calls `GET /drawing-revisions/:id/pages`
- **THEN** the API returns page number, preview key or preview URL, width, and height for each page

#### Scenario: Preview drawing revision
- **WHEN** an authorized user calls `GET /drawing-revisions/:id/preview`
- **THEN** the API returns short-lived preview access or a proxied preview response

#### Scenario: Set current revision
- **WHEN** an administrator calls `PATCH /drawing-revisions/:id/current`
- **THEN** the API marks that revision current for its drawing, clears the previous current revision, and writes an audit log
