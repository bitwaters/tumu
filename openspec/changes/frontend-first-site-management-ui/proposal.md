## Why

The project is a field-facing construction management tool, so usability of the mobile workflow will determine adoption before the backend is complete. Establishing the React UI shell, IBM/Carbon-inspired design system, and mock-data interaction paths first lets the team validate task handling, photo capture, drawing archive browsing, and dashboard layouts before committing backend APIs.

## What Changes

- Create a frontend-first implementation path for the power station site management website.
- Build the React/Vite/TypeScript web app shell before backend services.
- Establish an IBM/Carbon-inspired engineering UI theme: light, square, compact, status-driven, and mobile-first.
- Implement mock-data pages for mobile and desktop workflows while preserving the domain types from `docs/site-management-v1-dev.md`.
- Fix the first implementation milestone as UI/interaction stabilization, not backend completion.
- Defer real PostgreSQL, MinIO, Redis, authentication, export generation, and server-side permissions to later backend changes.

## Capabilities

### New Capabilities

- `frontend-app-shell`: React application scaffold, routing, responsive layout, IBM/Carbon-style theme tokens, shared UI primitives, and mock data layer.
- `site-item-workflow-ui`: Mobile-first issue/punch item pages for todo, list, create, detail, status actions, role-aware action visibility, and weak-network draft behavior using mock data.
- `drawing-photo-capture-ui`: Drawing archive preview, photo capture/upload queue prototype, and attachment evidence metadata display using mock data.
- `dashboard-admin-ui`: Desktop dashboard and administration screens for statistics, master data, users, drawings, imports/exports, and audit-log review using mock data.

### Modified Capabilities

- None.

## Impact

- Adds the first application implementation surface under the planned `apps/web` frontend.
- Adds shared frontend domain types aligned with the development document, including `SiteItem`, `User`, `Section`, `Area`, `Discipline`, `DrawingRevision`, `PhotoAttachment`, `WorkflowLog`, and dashboard summary types.
- Does not create production backend APIs, database schema, object storage integration, export generation, or real authentication in this change.
- Subsequent backend changes must preserve the frontend contracts proven by the mock data and UI flows.
