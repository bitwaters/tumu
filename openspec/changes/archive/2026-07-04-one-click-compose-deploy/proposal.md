## Why

Production deployment currently requires operators to run multiple commands in the correct order. A Docker Compose one-click deployment entrypoint reduces operational mistakes and gives the project a clearer handoff path for intranet servers.

## What Changes

- Add a `prod:deploy` command that orchestrates production environment initialization, preflight, image build, Compose startup, migrations, status, and smoke validation.
- Allow first deployment to pass `--host` and related env-bootstrap options; if `.env.production` already exists, reuse it by default.
- Support `--skip-smoke` for deployments before the smoke account exists.
- Update production docs to make `npm run prod:deploy` the recommended path.
- Add script tests for dry-run command sequencing and safety behavior.

## Capabilities

### New Capabilities

### Modified Capabilities
- `production-runtime-deployment`: Add a one-click Docker Compose deployment command requirement.

## Impact

- Root package scripts.
- New production deploy orchestration script.
- Production deployment docs.
- Script-level deployment tests.
