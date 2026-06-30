## ADDED Requirements

### Requirement: Workflow notifications
The API SHALL create station notifications for assignment, review request, void, and reopen workflow events.

#### Scenario: Dispatch notification
- **WHEN** an item is dispatched to a responsible organization and user
- **THEN** the responsible recipient receives a notification linked to the item

#### Scenario: Review request notification
- **WHEN** a rectifier submits an item for review
- **THEN** the site item creator plus eligible workflow owners receive review requested notifications

### Requirement: Notification read state
The API SHALL expose notification list, unread count, mark-read, and read-all endpoints for the current user.

#### Scenario: List notifications
- **WHEN** an authenticated user calls `GET /notifications`
- **THEN** the API returns only notifications for that user

#### Scenario: Mark notification read
- **WHEN** a user marks their notification as read
- **THEN** the API sets readAt and decreases unread count

#### Scenario: Cannot mark another user's notification
- **WHEN** a user attempts to mark another user's notification as read
- **THEN** the API rejects the request

### Requirement: Audit logging
The API SHALL write audit logs for security-sensitive and data-changing operations.

#### Scenario: Workflow audit log
- **WHEN** a workflow action changes an item
- **THEN** the API writes an audit log with actor, action, resource type, resource ID, request metadata, and contextual metadata

#### Scenario: Photo deletion audit log
- **WHEN** a photo is deleted by an authorized user
- **THEN** the API writes an audit log before or within the same transaction as the deletion marker

### Requirement: Audit query authorization
The API SHALL restrict audit log queries to administrators unless a later change explicitly grants broader access.

#### Scenario: Administrator queries audit logs
- **WHEN** an administrator calls `GET /audit/logs` with filters
- **THEN** the API returns matching audit logs

#### Scenario: Non-admin audit query rejected
- **WHEN** a non-admin user calls `GET /audit/logs`
- **THEN** the API returns 403

### Requirement: Reminder foundation hooks
The backend SHALL keep enough due-date and notification data to support later due-soon and overdue reminder jobs.

#### Scenario: Due date data is available
- **WHEN** a reminder job is added later
- **THEN** it can identify open items by dueAt, responsible user, responsible organization, and previous notification type/date
