## Why

Production readiness still has one unsafe password path: user creation, password reset, and user import can silently fall back to `password123`. That is acceptable for local seed data only, but not for production administration or bulk imports.

## What Changes

- Require an explicit password when an administrator creates a user through the API.
- Require an explicit password when an administrator resets a user password.
- Require imported users to provide a password column value instead of silently defaulting.
- Update the frontend admin forms so they no longer advertise or rely on a default password.
- Keep existing demo seed accounts unchanged for local development documentation.

## Capabilities

### New Capabilities

### Modified Capabilities
- `account-password-security`: Add requirements that administrative password assignment must be explicit and must not silently use shared default passwords.

## Impact

- API user service and legacy memory routes.
- User import validation.
- Frontend user create/reset forms and API client typing.
- API and frontend tests covering create/reset/import validation.
