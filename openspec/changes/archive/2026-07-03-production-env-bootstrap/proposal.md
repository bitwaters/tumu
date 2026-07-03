## Why

Production deployment currently requires operators to copy `.env.production.example` and manually replace multiple secrets and public URLs. That step is error-prone and is the largest remaining gap between a validated codebase and a repeatable production deployment process.

## What Changes

- Add a production environment bootstrap command that generates `.env.production` from safe inputs and random secrets.
- Keep `.env.production.example` as documentation, but make the generated file the recommended first-deployment path.
- Validate generated values by running the existing production Compose config check.
- Update the deployment runbook and setup docs with the new command.

## Capabilities

### New Capabilities

### Modified Capabilities
- `production-runtime-deployment`: Add a requirement that the project provides a safe production environment bootstrap command that avoids committed real secrets and prevents accidental overwrite.

## Impact

- Root package scripts: add `prod:init-env`.
- Scripts: add a Node-based production env initializer.
- Docs: update production deployment and backend setup instructions.
- Specs/tasks: update production runtime deployment contract and verification.
