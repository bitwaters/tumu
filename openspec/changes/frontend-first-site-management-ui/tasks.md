## 1. Frontend Scaffold

- [x] 1.1 Create `apps/web` React + TypeScript + Vite application structure.
- [x] 1.2 Add package scripts for frontend dev, build, preview, lint/typecheck where available.
- [x] 1.3 Add base routing structure for mobile routes and desktop admin routes.
- [x] 1.4 Add global CSS reset, typography defaults, and responsive viewport handling.

## 2. Theme And Shared UI

- [x] 2.1 Define IBM/Carbon-inspired theme tokens for colors, spacing, borders, typography, and status colors.
- [x] 2.2 Build shared UI primitives for buttons, icon buttons, inputs, selects, tabs, tags, cards, tables, empty states, and page headers.
- [x] 2.3 Build status label components for pending dispatch, dispatched, rectifying, pending review, closed, voided, due soon, overdue, and severe.
- [x] 2.4 Verify long Chinese names and item titles do not overlap on mobile cards or compact desktop tables.

## 3. Mock Domain Contracts

- [x] 3.1 Define frontend domain types for users, roles, section scopes, organizations, areas, disciplines, drawing revisions, drawing pages, site items, photos, workflow logs, notifications, exports, audit logs, and dashboard summaries.
- [x] 3.2 Create typed mock data aligned with `docs/site-management-v1-dev.md`.
- [x] 3.3 Add mock selectors/helpers for role-aware visible actions, status transitions, overdue calculation, dashboard summaries, and filtered item lists.
- [x] 3.4 Add mock idempotency guards for repeated create, workflow action, and photo-complete interactions.

## 4. Application Shells

- [x] 4.1 Implement the mobile shell with bottom navigation for `待办`, `事项`, `拍照`, `看板`, and `我的`.
- [x] 4.2 Implement the desktop shell with side navigation for dashboard, item management, drawings, master data, users, imports/exports, and audit logs.
- [x] 4.3 Implement responsive switching between mobile and desktop layouts without duplicating route state.
- [x] 4.4 Add a mock login page and user switcher flow for validating role-specific UI states.
- [x] 4.5 Build the mobile `我的` page with user identity, organization, role, notification entry, draft entry, password-change placeholder, and logout action.
- [x] 4.6 Add notification red-dot/count indicators to the mobile shell and profile entry.
- [x] 4.7 Build a mock notification list with read/unread state and mark-as-read behavior.

## 5. Site Item Workflow UI

- [x] 5.1 Build the mobile todo page with counts, quick actions, and compact item cards.
- [x] 5.2 Build the site item list page with search and filters for status, type, severity, section, area, discipline, organization, and overdue flag.
- [x] 5.3 Build the create-item form with item type, severity, title, description, section, area, discipline, location text, due date, and discovery photos.
- [x] 5.4 Implement local draft save and restore behavior for the create-item form.
- [x] 5.5 Build the item detail page with basic information, grouped photos, workflow timeline, and comments.
- [x] 5.6 Implement mock workflow actions for dispatch, start rectification, submit review, close, void, and reopen.
- [x] 5.7 Ensure role-aware action visibility matches administrator, supervisor, contractor manager, and rectifier expectations.
- [x] 5.8 Implement contractor manager assign-rectifier UI limited to active rectifiers in the same organization.
- [x] 5.9 Ensure contractor manager item list defaults to their own organization scope.
- [x] 5.10 Build the mobile dashboard page with compact status metrics, overdue metrics, rankings, and filters.

## 6. Drawing Archive And Photo Capture UI

- [x] 6.1 Build drawing archive preview components with page metadata and version visibility.
- [x] 6.2 Keep site items independent from drawing revision/page selection in mock state.
- [x] 6.3 Show drawing name, revision number, current revision state, and page count in drawing administration.
- [x] 6.4 Build the photo capture entry page with mock camera/gallery add flow.
- [x] 6.5 Build upload queue states for pending, uploading, failed, complete, and retry.
- [x] 6.6 Display photo evidence metadata snapshots for section, area, discipline, and responsible organization.

## 7. Dashboard And Administration UI

- [x] 7.1 Build the desktop dashboard with summary cards, status distribution, overdue counts, area statistics, discipline statistics, and organization ranking.
- [x] 7.2 Build dashboard filters and keep visible statistics consistent with filtered mock item lists.
- [x] 7.3 Build desktop item management with dense table display, filters, detail access, and export action placeholders.
- [x] 7.4 Build drawing management with drawing list, revision list, current revision indicator, and preview entry.
- [x] 7.5 Build master data pages for sections, organizations, areas, and disciplines.
- [x] 7.6 Build user management with roles, organizations, active state, and section scope display.
- [x] 7.7 Build imports/exports page with mock jobs, statuses, and download placeholders.
- [x] 7.8 Build audit log page with mock filtering by user, time, resource type, and action type.

## 8. Verification

- [x] 8.1 Run frontend typecheck and build successfully.
- [x] 8.2 Verify mobile routes at small viewport widths for no text overlap and usable bottom navigation.
- [x] 8.3 Verify desktop routes at desktop viewport widths for dense but readable dashboard, tables, and administration pages.
- [x] 8.4 Verify repeated mock submissions do not create duplicate items, photos, or workflow log entries.
- [x] 8.5 Verify drawing archive metadata remains readable in administration views.
- [x] 8.6 Verify mock login, profile, draft list, notification red-dot, and notification list flows.
- [x] 8.7 Verify contractor manager assignment and organization-scoped list behavior.
- [x] 8.8 Document any frontend contracts that backend implementation must preserve.
