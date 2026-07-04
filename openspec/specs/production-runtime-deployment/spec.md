# production-runtime-deployment Specification

## Purpose
Defines the production Docker Compose runtime, environment template, deployment scripts, migration flow, and smoke validation needed for project intranet deployment.
## Requirements
### Requirement: Production Compose Runtime
The system SHALL provide a root-level production Docker Compose runtime that starts Web, API, PostgreSQL, Redis, and MinIO/S3-compatible storage using production commands, persistent volumes, health checks, restart policies, and environment-driven configuration.

#### Scenario: Production compose config validates
- **WHEN** an operator runs the documented production Compose config validation command with a completed production environment file
- **THEN** Docker Compose validates the topology without requiring source-code bind mounts or development-only commands

#### Scenario: Production services become healthy
- **WHEN** production services are started after migrations have been applied
- **THEN** API, Web, PostgreSQL, Redis, and object storage containers report healthy or running states according to the documented checks

### Requirement: Production Environment Template
The system SHALL provide a production environment template and a production environment bootstrap command that list or generate required deployment values, secrets, hostnames, ports, database settings, object storage settings, JWT secret, CORS origin, upload limits, smoke account values, and backup directory configuration without committing real secrets.

#### Scenario: Missing required environment value
- **WHEN** the production preflight script runs with a missing required value
- **THEN** it fails before starting or migrating production services and reports the missing key

#### Scenario: Development defaults are not accepted as production secrets
- **WHEN** production preflight detects known development secrets for JWT, PostgreSQL, or object storage credentials
- **THEN** it fails with an actionable message telling the operator to replace those values

#### Scenario: Production environment file generated
- **WHEN** an operator runs the documented production environment bootstrap command with a host value
- **THEN** the command writes `.env.production` with generated non-placeholder secrets and public URLs derived from the host

#### Scenario: Existing production environment is protected
- **WHEN** `.env.production` already exists and the operator runs the bootstrap command without a force option
- **THEN** the command refuses to overwrite the existing file

#### Scenario: Production CORS origin generated
- **WHEN** an operator generates `.env.production` for a production Web URL
- **THEN** the environment file includes an API CORS origin matching the browser-visible Web URL

### Requirement: Deployment Validation Script
The system SHALL provide a deployment validation script that checks required tools, environment values, Compose configuration, built artifacts, API health, Web health, and a minimal authenticated API smoke path.

#### Scenario: Smoke validation succeeds
- **WHEN** production services are running and seeded or configured with an operator-provided test account
- **THEN** the validation script confirms API health, Web availability, login, site item list access, and notification count access

### Requirement: Production Runbook
The system SHALL document first deployment, upgrade, rollback, health checks, log inspection, migration, backup, restore, and smoke validation steps for an intranet project server.

#### Scenario: Operator performs first deployment
- **WHEN** an operator follows the production runbook from a clean server
- **THEN** they can prepare environment values, build images, apply migrations, start services, run smoke checks, and record the deployed Git commit

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
