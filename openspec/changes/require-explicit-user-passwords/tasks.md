## 1. API And Import Validation

- [ ] 1.1 Require explicit non-empty passwords in Prisma user creation and password reset services.
- [ ] 1.2 Apply the same explicit password requirement to legacy memory routes.
- [ ] 1.3 Require password values in user import validation and surface row-level errors.

## 2. Frontend Admin Forms

- [ ] 2.1 Remove default password values and default-password copy from user create/reset forms.
- [ ] 2.2 Ensure frontend create/reset submissions require a non-empty password before calling the API.

## 3. Tests, Documentation, And Archive

- [ ] 3.1 Add or update API/import/frontend tests for explicit password success and missing-password rejection.
- [ ] 3.2 Run targeted tests, API/Web typechecks, builds, and OpenSpec validation.
- [ ] 3.3 Archive the OpenSpec change after all tasks complete.
