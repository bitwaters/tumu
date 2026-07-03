## 1. Backend Password Change

- [ ] 1.1 Add authenticated `POST /auth/change-password` route for memory and Prisma runtimes.
- [ ] 1.2 Add auth service/repository support to verify the current password, hash the new password, update the current user, and write `change_password` audit records.
- [ ] 1.3 Add API tests for successful password change, old-password rejection, login with the new password, and audit creation.

## 2. Frontend Profile Integration

- [ ] 2.1 Add typed frontend auth API method for password change.
- [ ] 2.2 Replace the profile password placeholder with an inline change-password form, local confirmation validation, backend error display, and logout-after-success behavior.
- [ ] 2.3 Add frontend client tests for the password-change endpoint wiring.

## 3. Documentation And Verification

- [ ] 3.1 Update API/frontend contract docs and v1 development docs with password-change behavior.
- [ ] 3.2 Run API typecheck/build/tests and frontend typecheck/build/tests.
- [ ] 3.3 Run `openspec validate account-password-change --strict`.
