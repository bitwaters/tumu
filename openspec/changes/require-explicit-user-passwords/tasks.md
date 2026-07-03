## 1. API And Import Validation

- [x] 1.1 Require explicit non-empty passwords in Prisma user creation and password reset services.
- [x] 1.2 Apply the same explicit password requirement to legacy memory routes.
- [x] 1.3 Require password values in user import validation and surface row-level errors.

## 2. Frontend Admin Forms

- [x] 2.1 Remove default password values and default-password copy from user create/reset forms.
- [x] 2.2 Ensure frontend create/reset submissions require a non-empty password before calling the API.

## 3. Tests, Documentation, And Archive

- [x] 3.1 Add or update API/import/frontend tests for explicit password success and missing-password rejection.
- [x] 3.2 Run targeted tests, API/Web typechecks, builds, and OpenSpec validation.
- [ ] 3.3 Archive the OpenSpec change after all tasks complete.
