## ADDED Requirements

### Requirement: User authentication
The API SHALL authenticate users with username or phone plus password and return a token-bound current-user context.

#### Scenario: Successful login
- **WHEN** an active user submits valid credentials to `POST /auth/login`
- **THEN** the API returns an access token and the current user profile including role, organization, and section scope

#### Scenario: Failed login
- **WHEN** a user submits invalid credentials
- **THEN** the API returns an authentication error without revealing whether the username or password was incorrect

#### Scenario: Disabled user cannot log in
- **WHEN** a disabled user submits valid credentials
- **THEN** the API rejects the login request

### Requirement: Current user endpoint
The API SHALL expose `GET /auth/me` to return the authenticated user's identity, organization, role, and section scopes.

#### Scenario: Authenticated current user
- **WHEN** a request includes a valid token
- **THEN** `GET /auth/me` returns the current user context needed by the frontend shell

#### Scenario: Missing token
- **WHEN** a request has no valid token
- **THEN** `GET /auth/me` returns 401

### Requirement: Server-side resource authorization
The API MUST enforce role, organization, and section-scope authorization on every scoped list, detail, and write endpoint.

#### Scenario: Supervisor section filtering
- **WHEN** a supervisor requests site items
- **THEN** the API returns only items within the supervisor's authorized sections

#### Scenario: Contractor manager organization filtering
- **WHEN** a contractor manager requests site items
- **THEN** the API returns only visible items for their organization and authorized sections

#### Scenario: Rectifier assignment filtering
- **WHEN** a rectifier requests site items
- **THEN** the API returns only items assigned to that rectifier within authorized sections

### Requirement: Server-side workflow authorization
The API MUST validate workflow action permissions immediately before applying each workflow transition.

#### Scenario: Workflow owner is explicit
- **WHEN** the API evaluates dispatch, close, void, or reopen permissions
- **THEN** "workflow owner" means the site item creator or an administrator/supervisor with access to the item's section, and does not include contractor managers or rectifiers

#### Scenario: Unauthorized close rejected
- **WHEN** a rectifier attempts to close an item
- **THEN** the API rejects the request and does not update item status or workflow logs

#### Scenario: Contractor manager assignment restricted
- **WHEN** a contractor manager assigns a rectifier
- **THEN** the API allows only active rectifiers from the same responsible organization and authorized section
