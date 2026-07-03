## ADDED Requirements

### Requirement: Configurable API Mode
The frontend SHALL default to API-backed runtime mode and SHALL allow explicit mock fallback through configuration.

#### Scenario: API base URL configured
- **WHEN** the application starts with `VITE_API_BASE_URL` configured and mock mode disabled
- **THEN** frontend data reads and writes use the configured API base URL

#### Scenario: Explicit mock fallback
- **WHEN** the application starts with `VITE_USE_MOCKS=true`
- **THEN** the frontend uses the existing mock data and mock mutation behavior without calling the backend

### Requirement: Authenticated API Client
The frontend SHALL provide a typed API client that attaches bearer tokens, parses JSON responses, maps JSON errors, and handles unauthenticated sessions consistently.

#### Scenario: Authenticated request
- **WHEN** a user is logged in and a protected endpoint is called
- **THEN** the request includes the stored bearer token in the `Authorization` header

#### Scenario: API error response
- **WHEN** the backend returns a non-2xx JSON error
- **THEN** the client exposes a user-safe error message and status code to the UI

#### Scenario: Unauthorized response
- **WHEN** the backend returns 401 for a protected request
- **THEN** the frontend clears the invalid session and routes the user to login or shows the login view

### Requirement: Idempotent Write Support
The frontend SHALL send stable `Idempotency-Key` headers for retryable write actions.

#### Scenario: Retrying same action
- **WHEN** a create, workflow, comment, photo-complete, or delete action is retried after a weak-network failure
- **THEN** the retry uses the same idempotency key as the original action

#### Scenario: New user action
- **WHEN** the user starts a new create, workflow, comment, photo-complete, or delete action
- **THEN** the frontend generates a new idempotency key

### Requirement: Session Persistence
The frontend SHALL persist the login token across page refreshes and validate the session with `/auth/me`.

#### Scenario: Page refresh with saved token
- **WHEN** the browser reloads with a saved token
- **THEN** the frontend calls `/auth/me` and restores the current user if the token is valid

#### Scenario: Logout
- **WHEN** the user logs out
- **THEN** the frontend clears the token and current user state
