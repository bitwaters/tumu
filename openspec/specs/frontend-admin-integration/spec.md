# frontend-admin-integration Specification

## Purpose
Defines frontend integration for administrative and operational backend APIs, including notifications, drawing administration, master data, user management, audit logs, and authorization-aware admin surfaces.
## Requirements
### Requirement: API-Backed Notifications
The frontend SHALL load notifications and unread counts from backend notification endpoints.

#### Scenario: Unread count
- **WHEN** the mobile shell or profile page renders notification indicators
- **THEN** the frontend uses `/notifications/unread-count` for the current user count

#### Scenario: Mark notification read
- **WHEN** the user opens or marks a notification as read
- **THEN** the frontend calls `/notifications/:id/read` or `/notifications/read-all` and refreshes the unread count

### Requirement: API-Backed Drawing Administration
The desktop drawing management page SHALL use backend drawing and revision endpoints.

#### Scenario: List drawings
- **WHEN** the user opens drawing management
- **THEN** the frontend loads `/drawings` and displays current revision metadata

#### Scenario: Manage revision metadata
- **WHEN** an administrator creates a revision or sets a current revision
- **THEN** the frontend calls the corresponding drawing revision endpoint and refreshes the drawing row

### Requirement: API-Backed Master Data And Users
The desktop master data and user pages SHALL use backend list and write endpoints with existing role restrictions.

#### Scenario: Master data list
- **WHEN** the user opens sections, organizations, areas, or disciplines
- **THEN** the frontend loads the matching `/master-data/*` endpoint and renders backend-scoped data

#### Scenario: Admin write
- **WHEN** an administrator creates or updates master data or users
- **THEN** the frontend calls the matching backend endpoint and refreshes the table

#### Scenario: Non-admin write denied
- **WHEN** a non-admin attempts an admin-only write through stale UI state
- **THEN** the frontend shows the backend error and refreshes the current page data

### Requirement: API-Backed Audit Log
The desktop audit page SHALL load audit logs from `/audit/logs` and preserve filtering by resource type and action where available.

#### Scenario: Admin views audit logs
- **WHEN** an administrator opens the audit page with filters
- **THEN** the frontend calls `/audit/logs` with supported filters and renders returned audit entries

#### Scenario: Unauthorized audit access
- **WHEN** a non-admin opens audit logs through stale navigation
- **THEN** the frontend shows a forbidden state and does not display stale mock audit data
