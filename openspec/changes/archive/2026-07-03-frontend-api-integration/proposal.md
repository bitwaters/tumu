## Why

The current frontend is a polished mock prototype, while the backend now has Prisma/PostgreSQL-backed APIs for authentication, site items, workflow, photos, notifications, drawings, master data, users, and audit. This change connects the fixed UI experience to real API data so the system can move from prototype validation to end-to-end site use.

## What Changes

- Replace mock-only frontend state for production flows with authenticated API calls.
- Add a browser API client with token storage, JSON error handling, idempotency-key support, and configurable API base URL.
- Connect login, current-user, logout placeholder, role-aware visibility, and user switcher behavior to backend auth.
- Connect site item list/detail/create/edit/workflow/comment flows to real endpoints while preserving the current mobile and desktop layouts.
- Connect the personal photo gallery to presign, object upload, complete-upload, preview, delete, and photo selection/binding flows.
- Connect notifications, unread counts, mark-read, and read-all to real endpoints.
- Connect drawings, master data, users, and audit desktop administration views to real read/write APIs where backend support already exists.
- Keep mock data available only as development fallback/demo mode, not as the default runtime path.
- Add frontend integration tests or API-client tests for happy paths, permission errors, failed uploads, and idempotent retries.

## Capabilities

### New Capabilities

- `frontend-api-client`: Covers the typed frontend HTTP client, auth/session handling, idempotency-key behavior, API error mapping, and mock fallback controls.
- `frontend-site-item-integration`: Covers API-backed site item list, detail, create, edit, workflow, comment, and role-aware action refresh behavior.
- `frontend-photo-integration`: Covers API-backed personal gallery, upload queue, presign/complete flow, preview, delete, and photo selection/binding from forms.
- `frontend-admin-integration`: Covers API-backed desktop pages for drawings, master data, users, notifications, and audit logs.

### Modified Capabilities

None.

## Impact

- Affected frontend code: `apps/web/src/App.tsx`, `apps/web/src/model.ts`, `apps/web/src/mockData.ts`, `apps/web/src/types.ts`, and new API/state modules under `apps/web/src`.
- Affected backend surface: existing `/auth`, `/users`, `/master-data`, `/drawings`, `/site-items`, `/photos`, `/notifications`, and `/audit` endpoints; no backend endpoint renames are expected.
- Affected docs: `docs/frontend-contracts.md` and backend setup notes may need updates for local API/Web startup and environment variables.
- Dependencies may include a lightweight test setup for frontend API-client tests; avoid adding a large data-fetching framework unless it removes clear complexity.
