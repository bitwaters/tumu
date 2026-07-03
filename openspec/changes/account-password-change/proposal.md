## Why

The profile page still shows password change as a placeholder, while the v1 development document expects users to be able to change passwords before production use. Leaving this as an admin-only reset path is a production account-security gap for field users and supervisors.

## What Changes

- Add a current-user password change API that requires the old password and a new password.
- Write an audit record when a user changes their own password.
- Add a frontend profile form that replaces the password placeholder and logs the user out after a successful password change.
- Add API and frontend tests for successful change, old-password rejection, and route wiring.
- Update API/frontend contract docs with the password-change endpoint and client behavior.

## Capabilities

### New Capabilities
- `account-password-security`: Covers current-user password change, old password verification, audit logging, frontend profile behavior, and re-login requirement after password change.

### Modified Capabilities

## Impact

- Backend API: new authenticated `/auth/change-password` route and auth service method.
- Backend persistence: update the current user's password hash using existing user storage.
- Frontend API/client: add typed password-change call.
- Frontend UI: replace profile placeholder with an inline change-password form.
- Tests/docs: add focused API and frontend client tests plus contract documentation.
