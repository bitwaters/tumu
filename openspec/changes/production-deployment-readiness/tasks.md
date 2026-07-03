## 1. Production Runtime Files

- [x] 1.1 Add production Dockerfiles for API and Web that build from the repository without bind mounts or dev servers.
- [x] 1.2 Add `infra/docker-compose.prod.yml` with production commands, pinned base images, restart policies, persistent volumes, health checks, and environment-driven configuration.
- [x] 1.3 Add `.env.production.example` with required production values and no real secrets.
- [x] 1.4 Add root package scripts for production compose config validation, image build, startup, shutdown, and status checks.

## 2. Deployment Validation Scripts

- [x] 2.1 Add a production preflight script that validates required tools, environment file presence, required variables, non-development secrets, backup directory writability, and compose config.
- [x] 2.2 Add a production migrate script that runs Prisma migrations against the configured production database without seeding or resetting data.
- [x] 2.3 Add a production smoke script that validates API health, Web availability, login, site item list access, and notification count access.
- [x] 2.4 Ensure scripts fail fast with readable operator-facing errors and do not print secrets.

## 3. Backup And Restore Operations

- [x] 3.1 Add a PostgreSQL backup script that writes a timestamped non-empty dump under the configured backup directory.
- [x] 3.2 Add a PostgreSQL restore script that requires an explicit restore target and refuses ambiguous production overwrite.
- [x] 3.3 Add a MinIO/S3 object backup script that mirrors or archives the configured bucket under the configured backup directory.
- [x] 3.4 Add a MinIO/S3 object restore script that requires explicit target endpoint and bucket configuration.
- [x] 3.5 Add backup/restore validation checks for output existence, non-empty artifacts, and post-restore smoke validation guidance.

## 4. Documentation

- [x] 4.1 Add `docs/production-deployment.md` covering first deployment, environment setup, image build, migration, startup, health checks, smoke checks, upgrade, rollback, and log inspection.
- [x] 4.2 Add `docs/backup-restore.md` covering backup frequency, retention expectations, restore testing cadence, database restore, object restore, and evidence records.
- [x] 4.3 Update existing backend setup docs to distinguish local development, staging, and production commands.

## 5. Verification

- [x] 5.1 Run `docker compose -f infra/docker-compose.prod.yml --env-file .env.production.example config` or an equivalent safe validation path.
- [x] 5.2 Run frontend and API typecheck/build/tests after deployment-file changes.
- [x] 5.3 Run script-level dry runs or safe checks for preflight, backup target validation, and smoke script argument validation.
- [x] 5.4 Run `openspec validate production-deployment-readiness --strict`.
