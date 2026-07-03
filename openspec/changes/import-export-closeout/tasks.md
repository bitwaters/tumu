## 1. Data Model And Utilities

- [x] 1.1 Extend Prisma schema and public types for export jobs, import jobs, artifact metadata, and row-level import errors.
- [x] 1.2 Add migrations and mappers for export/import job persistence.
- [x] 1.3 Add CSV escaping/parsing utilities and file naming helpers with unit coverage.
- [x] 1.4 Add PDF closeout generation utility with item metadata, workflow logs, and photo manifest references.

## 2. Export Backend

- [x] 2.1 Implement scoped site item ledger export service and route.
- [ ] 2.2 Implement photo package export service and route with manifest.
- [ ] 2.3 Implement single item PDF closeout export service and route.
- [ ] 2.4 Implement audit log export service and route for administrators.
- [x] 2.5 Implement export job status and download endpoints with permission checks.
- [ ] 2.6 Add API tests for export permissions, scoping, artifact presence, and download denial.

## 3. Import Backend

- [ ] 3.1 Implement import file upload or text payload handling for supported master-data kinds.
- [ ] 3.2 Implement row validation for organizations, sections, areas, disciplines, and users.
- [ ] 3.3 Implement idempotent import job creation with accepted/rejected row counts.
- [ ] 3.4 Write audit records for applied import rows.
- [ ] 3.5 Add import job status endpoint with row-level errors and no password hash exposure.
- [ ] 3.6 Add API tests for admin-only access, validation errors, idempotent retries, and partial accepted rows.

## 4. Frontend Integration

- [ ] 4.1 Connect desktop import/export page to export job creation, status refresh, and download actions.
- [ ] 4.2 Connect audit export button to the audit export job endpoint and download flow.
- [ ] 4.3 Add import UI controls for master data/users with file or pasted CSV input and result display.
- [ ] 4.4 Keep buttons hidden or disabled for unauthorized roles based on backend errors and role checks.

## 5. Documentation And Verification

- [ ] 5.1 Update API/frontend contract docs with import/export endpoints and payloads.
- [ ] 5.2 Run API typecheck/build/tests and frontend typecheck/build/tests.
- [ ] 5.3 Run production compose config validation after dependency changes.
- [ ] 5.4 Run `openspec validate import-export-closeout --strict`.
