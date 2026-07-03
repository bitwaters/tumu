## Context

The backend already supports login, current-user lookup, logout audit records, and admin password resets. The frontend profile page exposes user identity and notifications but still shows password change as a placeholder. Production users need a self-service path that verifies the old password and avoids exposing password hashes.

## Goals / Non-Goals

**Goals:**
- Let an authenticated user change their own password after providing the current password.
- Reuse existing password hashing and audit infrastructure.
- Replace the profile placeholder with an actual form and require re-login after success.
- Keep tests focused on route behavior, authorization, and frontend client wiring.

**Non-Goals:**
- Add a full token revocation table or JWT version migration.
- Add password complexity policy beyond basic non-empty/minimum length validation.
- Add forgotten-password or external identity provider flows.

## Decisions

1. **Implement `POST /auth/change-password` instead of a `/users/:id` self-update route.**  
   Password change is an account-authentication concern and always applies to the current user, so putting it under `/auth` keeps it separate from administrator user management.

2. **Require `currentPassword` and `newPassword` in the request body.**  
   The backend verifies the old password before writing a new hash. This prevents anyone with an unattended active session from changing credentials without knowing the current secret.

3. **Log the user out in the frontend after success.**  
   Existing JWTs are stateless and cannot be invalidated without adding persistent token versioning. Logging out the current browser session gives the user clear re-authentication behavior while keeping this change small and production-useful.

4. **Reuse `UsersRepository.resetPassword` for the write.**  
   The repository already updates password hashes safely. The auth service will own validation, verification, and audit semantics.

## Risks / Trade-offs

- [Risk] Other already-issued tokens remain technically valid until expiry because JWTs are stateless.  
  Mitigation: the frontend logs out the current session immediately; full token versioning can be added later as a separate hardening change.

- [Risk] Users may choose weak passwords if only basic validation is implemented.  
  Mitigation: enforce a minimum length now and leave configurable complexity policy for a later security policy change.
