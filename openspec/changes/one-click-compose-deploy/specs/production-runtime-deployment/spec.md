## ADDED Requirements

### Requirement: One-Click Compose Deployment
The system SHALL provide a documented one-click Docker Compose deployment command that can initialize missing production environment configuration, validate deployment inputs, build production images, start production services, run database migrations, show service status, and run smoke validation unless explicitly skipped.

#### Scenario: First deployment initializes environment
- **WHEN** an operator runs the one-click deployment command with a host value and `.env.production` does not exist
- **THEN** the command generates `.env.production` using the production environment bootstrap behavior before running deployment checks

#### Scenario: Existing environment is preserved
- **WHEN** `.env.production` already exists and the operator runs the one-click deployment command
- **THEN** the command reuses the existing environment file and does not overwrite production secrets

#### Scenario: Deployment sequence runs in order
- **WHEN** the one-click deployment command runs with a valid production environment
- **THEN** it runs preflight validation, builds images, starts Compose services, applies migrations, prints service status, and runs smoke validation in that order

#### Scenario: Smoke can be explicitly skipped
- **WHEN** an operator runs the one-click deployment command with a skip-smoke option
- **THEN** the command completes the deployment sequence without running smoke validation and reports that smoke was skipped
