## ADDED Requirements

### Requirement: API workspace scaffold
The system SHALL provide a TypeScript backend application workspace under `apps/api` with package scripts for development, build, test, lint or typecheck, and database operations.

#### Scenario: Backend build command is available
- **WHEN** a developer runs the documented backend build script
- **THEN** the API TypeScript source compiles without requiring the frontend dev server

#### Scenario: Backend development command is available
- **WHEN** a developer runs the documented backend dev script
- **THEN** the API starts with environment-based configuration

### Requirement: Health and readiness endpoints
The API SHALL expose health endpoints that report service status and dependency readiness.

#### Scenario: Basic health check
- **WHEN** a client calls `GET /health`
- **THEN** the API returns a successful response identifying the service as running

#### Scenario: Readiness check includes dependencies
- **WHEN** a client calls `GET /ready`
- **THEN** the API reports PostgreSQL, Redis, and object storage readiness

### Requirement: Local infrastructure composition
The repository SHALL provide local Docker Compose infrastructure for PostgreSQL, Redis, MinIO, API, and Web.

#### Scenario: Infrastructure starts locally
- **WHEN** a developer starts the documented infrastructure command
- **THEN** PostgreSQL, Redis, MinIO, API, and Web services are configured with stable local ports

#### Scenario: Infrastructure can be stopped cleanly
- **WHEN** a developer stops the documented infrastructure command
- **THEN** all local project services stop without requiring manual process cleanup

### Requirement: API conventions
The API SHALL provide consistent JSON response shapes, validation errors, and request metadata capture.

#### Scenario: Validation error response
- **WHEN** a request body fails schema validation
- **THEN** the API returns a 400 response with field-level error details

#### Scenario: Request metadata is available
- **WHEN** an authenticated write request is processed
- **THEN** the API can record actor, IP address, user agent, method, path, and request ID for audit use
