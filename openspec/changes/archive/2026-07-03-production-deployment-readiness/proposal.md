## Why

The application now has API-backed frontend, PostgreSQL persistence, object storage, and local smoke coverage, but it still lacks a repeatable production deployment baseline. Without production-grade Compose files, environment templates, health checks, backups, and an operator runbook, the system cannot be safely deployed to an intranet project server.

## What Changes

- Add a production-oriented Docker Compose topology for Web, API, PostgreSQL, Redis, and MinIO/S3 with pinned images, health checks, restart policies, persistent volumes, and environment-driven secrets.
- Add production environment templates that separate development defaults from required deployment values.
- Add repeatable deployment scripts for preflight checks, migration, startup validation, smoke checks, backup, and restore.
- Add a production deployment runbook covering first deployment, upgrade, rollback, backup/restore verification, and operational checks.
- Keep the existing development Compose flow intact for local work.

## Capabilities

### New Capabilities

- `production-runtime-deployment`: Covers production Compose topology, environment configuration, health checks, startup validation, and deployment runbook expectations.
- `backup-restore-operations`: Covers PostgreSQL and object storage backup/restore scripts, retention-oriented outputs, and verification requirements.

### Modified Capabilities

None.

## Impact

- Affected infrastructure files: `infra/`, deployment scripts, environment examples, and documentation under `docs/`.
- Affected package scripts: root `package.json` may gain production deployment and validation commands.
- Affected runtime behavior: no business API or frontend workflow behavior changes are expected.
- External systems: project intranet Docker host, PostgreSQL volume, Redis service, MinIO/S3 object storage, and filesystem backup destination.
