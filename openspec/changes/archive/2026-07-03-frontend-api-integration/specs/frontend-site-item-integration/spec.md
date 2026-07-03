## ADDED Requirements

### Requirement: API-Backed Site Item Lists
The frontend SHALL load site item lists from `/site-items` with search and filter query parameters matching the existing UI controls.

#### Scenario: List with filters
- **WHEN** the user applies status, type, severity, section, area, discipline, organization, overdue, or search filters
- **THEN** the frontend calls `/site-items` with equivalent query parameters and renders the returned scoped list

#### Scenario: Role-scoped list
- **WHEN** a contractor manager or rectifier opens the item list
- **THEN** the list reflects backend authorization scope and does not add broader client-only visibility

### Requirement: API-Backed Site Item Detail
The frontend SHALL load site item detail from `/site-items/:id` and render returned item fields, grouped photos, workflow logs, and allowed actions.

#### Scenario: Opening item detail
- **WHEN** the user opens an item card or desktop table row
- **THEN** the frontend loads `/site-items/:id` and displays the returned detail payload

#### Scenario: Action visibility
- **WHEN** item detail includes `allowedActions`
- **THEN** the frontend action area renders actions from `allowedActions` instead of relying on mock-only helper logic

### Requirement: API-Backed Item Creation And Editing
The frontend SHALL submit item create and edit forms to the backend while preserving local draft behavior.

#### Scenario: Create item with discovery photos
- **WHEN** the user submits a new item with selected unbound photo IDs
- **THEN** the frontend posts to `/site-items` with form fields and `photoIds`, then opens or refreshes the created item detail

#### Scenario: Save draft
- **WHEN** the user saves a draft instead of submitting
- **THEN** the frontend stores the draft locally without calling the backend

#### Scenario: Edit open item
- **WHEN** an authorized user edits an open item
- **THEN** the frontend patches `/site-items/:id` and refreshes the item detail from the response

### Requirement: API-Backed Workflow Actions
The frontend SHALL call workflow endpoints for dispatch, assign rectifier, start rectify, submit review, close, void, reopen, and comment.

#### Scenario: Submit workflow action
- **WHEN** the user confirms a workflow action
- **THEN** the frontend posts to the matching workflow endpoint with required fields, photo IDs, comments, and an idempotency key

#### Scenario: Rectifier submits review photos
- **WHEN** a rectifier submits review with selected rectification photos
- **THEN** the frontend sends the selected `photoIds` to `/site-items/:id/submit-review`

#### Scenario: Workflow mutation succeeds
- **WHEN** the backend returns updated item detail
- **THEN** the frontend refreshes item detail, item list summaries, notification counts, and dashboard counts where visible

#### Scenario: Workflow mutation forbidden
- **WHEN** the backend returns 403 for a workflow action
- **THEN** the frontend shows an error and reloads item detail so stale action buttons disappear
