# production-runtime-deployment Specification

## Purpose
Defines the production Docker Compose runtime, environment template, deployment scripts, migration flow, and smoke validation needed for project intranet deployment.
## Requirements
### Requirement: Production Compose Runtime
The system SHALL provide a production Docker Compose runtime that starts Web, API, PostgreSQL, Redis, and MinIO/S3-compatible storage using production commands, persistent volumes, health checks, restart policies, and environment-driven configuration.

#### Scenario: Production compose config validates
- **WHEN** an operator runs the documented production Compose config validation command with a completed production environment file
- **THEN** Docker Compose validates the topology without requiring source-code bind mounts or development-only commands

#### Scenario: Production services become healthy
- **WHEN** production services are started after migrations have been applied
- **THEN** API, Web, PostgreSQL, Redis, and object storage containers report healthy or running states according to the documented checks

### Requirement: Production Environment Template
The system SHALL provide a production environment template that lists required deployment values, secrets, hostnames, ports, database settings, object storage settings, JWT secret, upload limits, and backup directory configuration without committing real secrets.

#### Scenario: Missing required environment value
- **WHEN** the production preflight script runs with a missing required value
- **THEN** it fails before starting or migrating production services and reports the missing key

#### Scenario: Development defaults are not accepted as production secrets
- **WHEN** production preflight detects known development secrets for JWT, PostgreSQL, or object storage credentials
- **THEN** it fails with an actionable message telling the operator to replace those values

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
