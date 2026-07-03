## Context

The frontend currently runs as a mock-first React/Vite application with all domain data and mutations in local state. The backend now exposes Prisma/PostgreSQL-backed endpoints that preserve the fixed frontend contract for roles, statuses, site items, photos, notifications, drawings, master data, users, and audit logs.

This change is cross-cutting because it replaces the data source for most screens while preserving the mobile-first UI and desktop administration layouts. The implementation must keep the prototype usable during development, but real API mode should become the default path for normal local infrastructure.

## Goals / Non-Goals

**Goals:**

- Add a typed API client layer for authenticated JSON requests, upload requests, idempotency keys, and error mapping.
- Replace mock-backed production flows with API-backed data loading and mutations.
- Preserve current UI structure, role-aware visibility, status labels, and photo selection behavior.
- Keep mock mode as an explicit fallback for UI-only development.
- Verify the main mobile and desktop paths against a running local API.

**Non-Goals:**

- Do not redesign the mobile or desktop UI.
- Do not add new backend endpoints unless an existing endpoint is missing a field needed by the fixed frontend contract.
- Do not implement Excel import/export, PDF closeout sheets, due reminder jobs, or backup automation in this change.
- Do not introduce full offline sync; keep local drafts and upload retry behavior only.

## Decisions

1. **Use a thin local API client instead of a heavy data-fetching framework.**

   The app is currently compact and stateful, so a small `apiClient` plus React state keeps implementation readable. A framework such as React Query can be introduced later if cache invalidation becomes complex.

2. **Keep one domain-facing state facade.**

   UI components should keep calling domain actions such as `createItem`, `submitReview`, `addPhoto`, and `markNotificationRead`. The facade decides whether to call the API or mock fallback, which limits UI churn and makes rollback easy.

3. **API mode is the default; mock mode is explicit.**

   Use a frontend environment variable such as `VITE_API_BASE_URL` for the API origin and `VITE_USE_MOCKS=true` only for demo fallback. If API mode fails, show an actionable error rather than silently switching to mock data.

4. **All retryable writes generate stable idempotency keys at the action boundary.**

   Create item, update item, workflow actions, photo complete/delete, comments, and admin writes should pass `Idempotency-Key` where the backend supports idempotency. The key should remain stable for a retry of the same user action and change for a new user action.

5. **Photo upload remains gallery-first.**

   The photo page uploads to the personal gallery. New item, rectification, and review forms choose from unbound gallery photos and bind them by `photoIds` during submit. This matches the agreed field workflow and prevents huge unbound-photo lists inside forms.

6. **Refresh detail after workflow mutations.**

   Workflow mutations return the updated detail payload, but the state facade should still normalize it through the same detail update path so allowed actions, photos, logs, and notifications stay consistent across mobile and desktop views.

## Risks / Trade-offs

- **[Risk] Backend and frontend payload shapes may differ in small fields.**  
  Mitigation: centralize response mapping in the API module and add API-client tests for the fields used by UI components.

- **[Risk] Upload retry can create confusing partial state.**  
  Mitigation: keep queue state separate from `PhotoAttachment` records; only `completeUpload` creates gallery records after object upload succeeds.

- **[Risk] Role-aware actions could diverge between frontend helper logic and backend allowed actions.**  
  Mitigation: prefer backend `allowedActions` from item detail for action buttons; keep frontend helpers only for fallback/mock mode.

- **[Risk] API mode can make local development harder if infrastructure is down.**  
  Mitigation: document local startup and keep explicit mock mode.

## Migration Plan

1. Add frontend env configuration and API client foundation while leaving mock UI unchanged.
2. Wire auth/current user first so all subsequent API calls have token context.
3. Replace read paths screen by screen: master data, items, photos, notifications, drawings, users, audit.
4. Replace write paths: create/edit item, workflow actions, comments, photo upload/delete, admin writes.
5. Add tests and run local API/Web together for mobile and desktop smoke coverage.
6. Keep mock mode available for rollback by setting `VITE_USE_MOCKS=true`.
