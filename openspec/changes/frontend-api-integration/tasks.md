## 1. API Client Foundation

- [x] 1.1 Add frontend environment configuration for `VITE_API_BASE_URL` and explicit `VITE_USE_MOCKS` fallback.
- [x] 1.2 Create a typed API client module with JSON request helpers, bearer token support, API error mapping, and base URL handling.
- [x] 1.3 Add idempotency-key generation and retry helpers for create, workflow, comment, photo complete, and delete actions.
- [x] 1.4 Add session storage helpers for token persistence, restore, and logout cleanup.
- [x] 1.5 Add focused API-client tests for success, 401, forbidden/error mapping, and idempotency header behavior.

## 2. Auth And Runtime State

- [x] 2.1 Refactor the current mock state facade so UI components can use either API-backed services or explicit mock fallback.
- [x] 2.2 Connect login to `POST /auth/login` and current-user restore to `GET /auth/me`.
- [x] 2.3 Connect logout UI to token cleanup and backend logout placeholder where available.
- [x] 2.4 Replace mock user switcher behavior in API mode with authenticated current-user state while keeping switcher only in mock mode.
- [x] 2.5 Show loading, unauthenticated, and API error states without disrupting the existing mobile and desktop shells.

## 3. Site Item Read Paths

- [x] 3.1 Connect site item lists to `GET /site-items` with search, status, type, severity, section, area, discipline, organization, and overdue filters.
- [x] 3.2 Connect mobile todo counts and desktop dashboard metrics to API-backed scoped item data.
- [x] 3.3 Connect site item detail to `GET /site-items/:id` and render backend grouped photos, workflow logs, and allowed actions.
- [x] 3.4 Remove production reliance on mock-only visibility helpers where backend scoped data or detail `allowedActions` is available.
- [x] 3.5 Add stale-data refresh behavior after returning from detail, workflow action, or photo selection.

## 4. Site Item Write And Workflow Paths

- [x] 4.1 Connect create-item form submission to `POST /site-items` with selected discovery `photoIds` and idempotency key.
- [x] 4.2 Keep local draft save/restore entirely local and separate from backend item creation.
- [x] 4.3 Connect item edit form to `PATCH /site-items/:id` and refresh detail from the response.
- [x] 4.4 Connect dispatch and assign-rectifier actions to their workflow endpoints with responsibility validation inputs.
- [x] 4.5 Connect start-rectify, submit-review, close, void, reopen, and comment actions to their workflow endpoints.
- [x] 4.6 Ensure submit-review and close can bind selected rectification/review photo IDs.
- [x] 4.7 On 403 or stale workflow errors, show the backend error and reload item detail so stale actions disappear.

## 5. Photo Gallery And Upload

- [x] 5.1 Connect the photo tab to `GET /photos` and keep gallery data scoped to the current user.
- [x] 5.2 Implement `POST /photos/presign`, object upload, and `POST /photos/complete` flow with upload queue states.
- [x] 5.3 Ensure upload retry reuses the original complete-upload idempotency key and does not create duplicate gallery records.
- [x] 5.4 Connect photo preview to `GET /photos/:id/preview`.
- [x] 5.5 Connect photo delete to `DELETE /photos/:id` with an idempotency key and gallery refresh.
- [x] 5.6 Implement form photo-selection mode using `GET /photos?unboundOnly=true`, confirm selected IDs, and return to the originating form.
- [x] 5.7 Preserve evidence display from item detail grouped photos and snapshot metadata rather than current gallery state.

## 6. Desktop Administration And Notifications

- [x] 6.1 Connect notification list, unread count, mark-read, and read-all to `/notifications` endpoints.
- [x] 6.2 Connect drawing management read paths to `/drawings`, revisions, pages, preview, and set-current endpoints.
- [x] 6.3 Connect master data pages to `/master-data/sections`, `/organizations`, `/areas`, and `/disciplines` list/create/update endpoints.
- [x] 6.4 Connect user management to `/users`, create, update, disable, and reset-password endpoints.
- [x] 6.5 Connect audit log page to `/audit/logs` with supported filters and forbidden-state handling.
- [x] 6.6 Keep import/export UI as placeholders unless backend endpoints already exist for a specific action.

## 7. Verification And Documentation

- [x] 7.1 Run frontend typecheck and build in mock mode and API mode.
- [x] 7.2 Run API typecheck/build/tests needed for contract confidence.
- [ ] 7.3 Start local infrastructure and verify login, item list/detail, create item, workflow, photo upload/bind, notification, and desktop admin smoke paths.
- [ ] 7.4 Verify mobile small viewport and desktop viewport still have no overlapping text or broken layout after API loading/error states.
- [x] 7.5 Update `docs/frontend-contracts.md` and backend setup docs with API mode environment variables and local startup steps.
- [x] 7.6 Run `openspec validate frontend-api-integration --strict`.
