## Context

The repository currently contains the v1 development document but no application code. The user wants to begin with frontend page construction because UI style and field workflow strongly affect adoption for a mobile-first construction site tool. The frontend must therefore stabilize the application shell, visual language, page flows, and interaction contracts before backend, database, object storage, notification, and export systems are implemented.

The source product specification is `docs/site-management-v1-dev.md`. This change implements only the frontend-first UI prototype milestone, using mock data and typed contracts that remain aligned with the future backend.

## Goals / Non-Goals

**Goals:**

- Scaffold a React/Vite/TypeScript frontend app under the planned `apps/web` structure.
- Establish an IBM/Carbon-inspired engineering UI system: light theme, square controls, compact density, status colors, and responsive layouts.
- Provide mobile-first pages for login, todo, site item list, site item creation, site item detail, photo capture, mobile dashboard, and profile.
- Provide desktop pages for dashboard, item management, drawing management, master data, users, imports/exports, and audit logs.
- Use mock data and frontend domain types that match the v1 development document closely enough for later backend integration.
- Make core interactions reviewable: bottom navigation, item cards, status actions, photo upload queue, role-aware visible actions, and weak-network drafts.

**Non-Goals:**

- No production backend API implementation.
- No Prisma schema, PostgreSQL migration, MinIO integration, Redis task queue, or server-side authentication.
- No real PDF rendering/conversion pipeline; use frontend-safe mock previews or static placeholder drawing pages.
- No real export generation, audit persistence, notification scheduler, or object storage upload.
- No complete offline synchronization.

## Decisions

1. **Frontend-first mock implementation**

   Build the UI with deterministic mock data and local state before backend APIs exist. This lets stakeholders validate field ergonomics and page density early while preserving future API contracts through typed domain models.

   Alternative considered: start with database and API first. Rejected for this milestone because the user explicitly wants UI style and page use fixed before deeper backend implementation.

2. **IBM/Carbon-inspired custom theme instead of importing Carbon wholesale**

   Use Carbon design principles and color tokens, but implement project-specific CSS/components. This keeps the first milestone lightweight and avoids binding the app to a large component system before interaction details are stable.

   Alternative considered: install Carbon React components immediately. Deferred until dependency policy and component needs are proven.

3. **Mobile app shell as the primary navigation model**

   Mobile views use a fixed bottom navigation with `待办`, `事项`, `拍照`, `看板`, and `我的`. Desktop views use a side navigation and dense work surface. This matches the field-first usage model while preserving management workflows.

4. **Single source of frontend truth for mock domain types**

   Shared frontend types must model the future entities: `User`, `Section`, `Organization`, `Area`, `Discipline`, `DrawingRevision`, `DrawingRevisionPage`, `SiteItem`, `PhotoAttachment`, `WorkflowLog`, `Notification`, and dashboard summaries. Mock data must be created from those types, not ad hoc page literals.

5. **Role-aware UI without pretending to enforce security**

   The frontend prototype hides or shows actions based on mock roles to validate workflow ergonomics, but all real security remains a backend responsibility for later changes.

## Risks / Trade-offs

- [Risk] Mock pages drift from backend reality -> Mitigation: centralize domain types and keep field names aligned with `docs/site-management-v1-dev.md`.
- [Risk] UI polish displaces workflow correctness -> Mitigation: acceptance focuses on complete mobile flows, status actions, and photo queue behavior.
- [Risk] Carbon-style UI becomes too generic -> Mitigation: add light engineering cues through status tags, compact item cards, and construction-site terminology rather than decorative imagery.
- [Risk] Frontend-only role handling is mistaken for security -> Mitigation: document mock role behavior clearly and keep server-side permission implementation out of scope.
- [Risk] Drawing/PDF prototype overpromises production rendering -> Mitigation: keep drawings as archive previews only, while deferring real conversion and storage.
