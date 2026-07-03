## Context

The backend already has scoped site item, photo, user, master data, notification, and audit APIs, plus production object storage configuration. The current import/export UI is still a placeholder and the API only has an in-memory `ExportJob` type from the original prototype. V1 handover requires files that project staff can give to owners, supervisors, contractors, and archive teams.

## Goals / Non-Goals

**Goals:**

- Generate downloadable export artifacts for site item ledgers, photo packages, single-item PDF closeout sheets, and audit logs.
- Keep every export scoped by the requesting user's role and section permissions.
- Record export/import jobs with status, requester, timestamps, result metadata, and error messages.
- Import users and master data from CSV/XLSX-like tabular files with row-level validation results.
- Connect desktop UI to create jobs, inspect status, and download completed files.

**Non-Goals:**

- Do not implement configurable PDF templates, electronic seals, or handwritten signatures.
- Do not implement long-running distributed workers in this change; v1 can process small jobs synchronously while preserving job records.
- Do not implement drawing file import or CAD/DWG parsing.
- Do not replace the existing backup scripts with export jobs.

## Decisions

1. **Use persisted job records even when processing synchronously.**

   Synchronous generation is simpler for v1, but job records keep the UI and API compatible with future background queue processing.

2. **Generate CSV-compatible Excel ledgers first, with XLSX optional if a lightweight library is already acceptable.**

   CSV is transparent, easy to test, and opens in Excel. If XLSX generation is added, the API contract remains `excel` because the output content type and file name will identify the actual format.

3. **Store generated artifacts through the existing object storage abstraction where possible.**

   This keeps downloads consistent with photo previews and production MinIO/S3 deployment. A local fallback can be used in memory mode or tests.

4. **Make import validation row-oriented.**

   Operators need actionable feedback such as row number, field name, and message. A job can succeed with rejected rows only when valid rows were applied and rejected rows are reported.

5. **Use workflow logs as electronic signoff evidence in PDFs.**

   V1 does not include handwritten signatures or electronic seals, so closeout PDFs must include workflow log actor/time/comment data and bound photo evidence.

## Risks / Trade-offs

- **[Risk] Synchronous large exports can block API requests.**  
  Mitigation: document v1 size expectations, keep job model queue-ready, and add file-size/status errors.

- **[Risk] CSV opened in Excel may be mistaken for true XLSX.**  
  Mitigation: use clear file names/content types; add XLSX only if implementation risk stays low.

- **[Risk] Importing bad master data can corrupt operational filters.**  
  Mitigation: validate required columns, uniqueness, role values, organization types, and section scopes before writing each row.

- **[Risk] Generated PDFs may be plain but must be trustworthy.**  
  Mitigation: include immutable workflow logs, timestamps, actors, item metadata, and photo manifest references.

## Migration Plan

1. Add database models or repository storage for export/import jobs and artifact metadata.
2. Implement export generation services and routes, then connect the desktop UI.
3. Implement import parsing/validation services and routes, then connect the desktop UI.
4. Add focused API tests for permissions, scope filtering, generated artifact presence, and import validation.
5. Update docs and run OpenSpec validation.
