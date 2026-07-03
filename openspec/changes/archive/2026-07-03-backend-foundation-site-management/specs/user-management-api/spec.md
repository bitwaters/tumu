## ADDED Requirements

### Requirement: User administration APIs
The API SHALL expose administrator-only user management endpoints for the v1 user and permission model.

#### Scenario: List users
- **WHEN** an administrator calls `GET /users` with optional role, organization, section, active-state, or search filters
- **THEN** the API returns matching users with organization, role, active state, and section scopes

#### Scenario: Non-admin user list rejected
- **WHEN** a non-admin user calls `GET /users`
- **THEN** the API returns 403

#### Scenario: Create user
- **WHEN** an administrator creates a user with role, organization, login credentials, and section scopes
- **THEN** the API stores the user, hashes the password, persists UserSectionScope assignments, writes an audit log, and returns the created user without password data

#### Scenario: Update user and scopes
- **WHEN** an administrator updates a user's profile, role, organization, active state, or section scopes
- **THEN** the API applies the changes transactionally and writes an audit log

#### Scenario: Disable user blocks future login
- **WHEN** an administrator disables a user
- **THEN** that user can no longer authenticate and existing current-user checks fail after token/session validation is refreshed

#### Scenario: Reset password
- **WHEN** an administrator resets a user's password
- **THEN** the API stores only the new password hash, writes an audit log, and does not expose the password hash in responses

### Requirement: User permission safety
User administration changes SHALL preserve role, organization, and section-scope consistency.

#### Scenario: Invalid section scope rejected
- **WHEN** an administrator assigns a user to a section outside the current project
- **THEN** the API rejects the request

#### Scenario: Contractor user organization required
- **WHEN** an administrator creates or updates a contractor manager or rectifier
- **THEN** the API requires an active contractor organization
