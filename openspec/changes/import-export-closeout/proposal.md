## Why

The v1 development document requires Excel ledgers, photo packages, single-item PDF closeout sheets, audit export, and batch master-data import, but the current UI still exposes these paths as placeholders. These capabilities are needed before the system can support project handover, archive delivery, and administrator onboarding at production scale.

## What Changes

- Add backend export job endpoints for site item Excel ledger, site item photo package, single site item PDF closeout sheet, and audit log export.
- Generate downloadable files into the configured object storage or local export directory and expose job status plus download endpoints.
- Add backend import job endpoints for users, organizations, sections, areas, and disciplines using CSV or Excel-compatible tabular input.
- Add validation results for import jobs, including row numbers, accepted rows, rejected rows, and actionable error messages.
- Connect the desktop import/export UI to real jobs and downloads while keeping role and section-scope restrictions.

## Capabilities

### New Capabilities

- `closeout-export-jobs`: Covers export job creation, status, download, permission scoping, Excel ledger files, photo packages, PDF closeout sheets, and audit log export.
- `master-data-import-jobs`: Covers batch import job creation, validation, result reporting, and scoped/admin-only writes for users and master data.

### Modified Capabilities

None.

## Impact

- Affected backend code: API routes, Prisma schema/repositories/services for import/export jobs, file generation utilities, object storage integration, audit logging.
- Affected frontend code: desktop import/export page, audit export action, job status/download states.
- Affected docs: frontend/backend contract docs and deployment notes for export storage.
- Dependencies may include small, Node-compatible libraries for CSV/XLSX and PDF generation if standard APIs are insufficient.
