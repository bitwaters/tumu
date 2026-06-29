## ADDED Requirements

### Requirement: Mobile todo workspace
The system SHALL provide a mobile todo page that prioritizes the user's pending rectification, pending review, due-soon, and overdue site items with compact item cards and quick entry points.

#### Scenario: User opens mobile todo
- **WHEN** a user opens the mobile app home route
- **THEN** the page SHALL show counts for pending rectification, pending review, due-soon, and overdue items plus quick actions for creating an item and taking a photo

#### Scenario: User scans item cards
- **WHEN** the todo list contains multiple site items
- **THEN** each card SHALL show status, title, section or area, discipline, responsible organization, due time, severity, and photo count

### Requirement: Site item list and filters
The system SHALL provide a site item list page with mock-data filtering by status, item type, severity, section, area, discipline, responsible organization, and overdue flag.

#### Scenario: User filters overdue defects
- **WHEN** a user filters the list to overdue defect items
- **THEN** the list SHALL only display mock items matching the selected type and overdue condition

### Requirement: Site item creation form
The system SHALL provide a mobile-first create-item form for defect and punch items with fields for type, severity, title, description, section, area, discipline, location text, due date, and discovery photos.

#### Scenario: User creates a draft item
- **WHEN** a user enters required item information and chooses save draft
- **THEN** the frontend SHALL preserve the draft locally in mock state and make it visible from the profile or draft entry point

#### Scenario: User submits an item
- **WHEN** a user completes required fields and submits the form
- **THEN** the UI SHALL add a mock item in `pending_approval` status and show it in the item list

### Requirement: Site item detail and workflow actions
The system SHALL provide a site item detail page with status timeline, basic fields, grouped photos, workflow logs, and role-aware mock actions for dispatch, start rectification, submit review, close, void, and reopen.

#### Scenario: Supervisor reviews an item
- **WHEN** a mock supervisor opens an item that is pending review
- **THEN** the detail page SHALL show close and comment actions appropriate for review

#### Scenario: Rectifier opens assigned item
- **WHEN** a mock rectifier opens an assigned item in rectifying status
- **THEN** the detail page SHALL show submit-review behavior and SHALL NOT show close or void actions

#### Scenario: Contractor manager assigns rectifier
- **WHEN** a mock contractor manager opens an item dispatched to their organization without a responsible user
- **THEN** the detail page SHALL show an assign-rectifier action and SHALL limit selectable users to active rectifiers in that organization

#### Scenario: Contractor manager views own organization items
- **WHEN** a mock contractor manager opens the item list
- **THEN** the list SHALL default to items dispatched to or owned by that manager's organization and SHALL NOT show unrelated organization items in the default view

#### Scenario: Closed item is reopened
- **WHEN** a mock supervisor reopens a closed item
- **THEN** the item SHALL move to rectifying when the original responsible user is active, and the workflow log SHALL show a reopen entry

### Requirement: Mobile dashboard page
The system SHALL provide a mobile dashboard page that summarizes site item status, overdue counts, pending review counts, and key rankings in a compact format suitable for phone review.

#### Scenario: User opens mobile dashboard
- **WHEN** a mock user opens `看板` on mobile
- **THEN** the page SHALL show total open items, pending review items, overdue items, status distribution, and top overdue organizations or areas using compact cards

#### Scenario: User filters mobile dashboard
- **WHEN** a mock user changes section, area, discipline, or status filters on the mobile dashboard
- **THEN** the visible metrics SHALL update consistently with the filtered mock item set

### Requirement: Weak-network frontend behavior
The system SHALL prototype weak-network behavior through local drafts, upload queue state, and idempotency-key display or generation for write-like mock actions.

#### Scenario: User repeats submit action
- **WHEN** the user taps submit multiple times during a mock pending state
- **THEN** the UI SHALL prevent duplicate visible site items or duplicate workflow log entries
