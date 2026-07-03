## MODIFIED Requirements

### Requirement: Production Environment Template
The system SHALL provide a production environment template and a production environment bootstrap command that list or generate required deployment values, secrets, hostnames, ports, database settings, object storage settings, JWT secret, upload limits, smoke account values, and backup directory configuration without committing real secrets.

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
