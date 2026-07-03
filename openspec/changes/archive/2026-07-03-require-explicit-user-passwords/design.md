## Context

The system already supports self-service password changes and invalidates old tokens after a password update. Administrative paths still have legacy prototype defaults: creating users, resetting passwords, and importing users can produce accounts with `password123` when the operator omits a password. This weakens production security and makes accidental shared credentials likely.

## Goals / Non-Goals

**Goals:**
- Make password assignment explicit for user creation, reset, and import.
- Reject missing or blank administrative passwords with clear validation errors.
- Update frontend copy and form defaults so operators understand a password is required.
- Preserve local seed demo accounts and existing login tests that intentionally use demo credentials.

**Non-Goals:**
- Add password complexity policy beyond requiring a non-empty explicit value.
- Add password expiry, one-time password flows, or invite emails.
- Migrate existing seeded/demo account passwords.

## Decisions

1. **Reject omissions at the service/API boundary.**  
   The API will treat missing or blank passwords as invalid input instead of substituting a default. This keeps production, tests, and future clients aligned.

2. **Keep the frontend simple and explicit.**  
   Create/reset forms will start with an empty password field and label it as required. The UI should no longer mention `password123` as an implicit behavior.

3. **Require import password values.**  
   User import rows already validate required fields. Password will join that required set so bulk imports cannot create shared default credentials by accident.

## Risks / Trade-offs

- [Risk] Existing operator habits that leave password blank will now fail.  
  Mitigation: return clear validation messages and update UI placeholders.

- [Risk] Tests relying on omitted passwords need updates.  
  Mitigation: update tests to pass explicit demo passwords where needed and add negative tests for omissions.
