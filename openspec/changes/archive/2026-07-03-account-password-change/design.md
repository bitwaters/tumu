## Context

The backend already supports login, current-user lookup, logout audit records, and admin password resets. The frontend profile page exposes user identity and notifications but still shows password change as a placeholder. Production users need a self-service path that verifies the old password and avoids exposing password hashes.

## Goals / Non-Goals

**Goals:**
- Let an authenticated user change their own password after providing the current password.
- Reuse existing password hashing and audit infrastructure.
- Replace the profile placeholder with an actual form and require re-login after success.
- Keep tests focused on route behavior, authorization, and frontend client wiring.

**Non-Goals:**
- Add a token revocation table or session management UI.
- Add password complexity policy beyond basic non-empty/minimum length validation.
- Add forgotten-password or external identity provider flows.

## Decisions

1. **Implement `POST /auth/change-password` instead of a `/users/:id` self-update route.**  
   Password change is an account-authentication concern and always applies to the current user, so putting it under `/auth` keeps it separate from administrator user management.

2. **Require `currentPassword` and `newPassword` in the request body.**  
   The backend verifies the old password before writing a new hash. This prevents anyone with an unattended active session from changing credentials without knowing the current secret.

3. **Bind JWTs to the current password hash digest.**  
   Tokens include a stable digest of the user's password hash at login time. Authentication compares that digest with the current password hash digest, so changing the password invalidates older tokens without adding a new database column.

4. **Reuse `UsersRepository.resetPassword` for the write.**  
   The repository already updates password hashes safely. The auth service will own validation, verification, and audit semantics.

## Risks / Trade-offs

- [Risk] Other already-issued tokens remain technically valid until expiry because JWTs are stateless.  
  Mitigation: include a password-hash digest in issued tokens and reject tokens whose digest no longer matches the current user record.

- [Risk] Users may choose weak passwords if only basic validation is implemented.  
  Mitigation: enforce a minimum length now and leave configurable complexity policy for a later security policy change.
