## ADDED Requirements

### Requirement: React app scaffold
The system SHALL provide a React, TypeScript, and Vite frontend application scaffold under `apps/web` with a runnable development server, production build command, and source layout suitable for page, component, type, and mock-data modules.

#### Scenario: Developer starts the frontend
- **WHEN** a developer runs the documented frontend dev command
- **THEN** the app SHALL start locally and render the application shell without requiring a backend service

#### Scenario: Developer builds the frontend
- **WHEN** a developer runs the documented frontend build command
- **THEN** the app SHALL complete a production build without TypeScript errors

### Requirement: Engineering UI theme
The system SHALL define an IBM/Carbon-inspired engineering theme with light backgrounds, compact spacing, square controls, clear borders, readable Chinese typography, and standardized status colors for in-progress, closed, pending-review, overdue, severe, and voided states.

#### Scenario: Status colors are consistent
- **WHEN** the same site item status appears in todo, list, detail, and dashboard views
- **THEN** the status label SHALL use the same text and color semantics in every view

#### Scenario: Text fits compact surfaces
- **WHEN** long Chinese organization names, area names, or item titles are displayed on mobile cards
- **THEN** the UI SHALL wrap or truncate text professionally without overlapping neighboring content

### Requirement: Responsive application shell
The system SHALL provide a mobile shell with bottom navigation and a desktop shell with side navigation, switching layout based on viewport width while preserving the same underlying route structure.

#### Scenario: Mobile navigation is shown
- **WHEN** the app is viewed on a mobile-width viewport
- **THEN** the shell SHALL show bottom navigation entries for `待办`, `事项`, `拍照`, `看板`, and `我的`

#### Scenario: Desktop navigation is shown
- **WHEN** the app is viewed on a desktop-width viewport
- **THEN** the shell SHALL show a side navigation for dashboard, item management, drawings, master data, users, imports/exports, and audit logs

### Requirement: Mock login and profile workspace
The system SHALL provide a mock login page and a mobile profile workspace for validating role-specific UI, notifications, drafts, account information, password-change entry point, and logout behavior without real authentication.

#### Scenario: User opens login page
- **WHEN** the app starts without a selected mock user
- **THEN** the login page SHALL show username or phone input, password input, login action, and mock role selection or mock account selection

#### Scenario: User opens profile page
- **WHEN** a mock user opens `我的`
- **THEN** the page SHALL show user identity, organization, role, notification entry, draft entry, password-change placeholder, and logout action

#### Scenario: User opens draft entry
- **WHEN** a mock user has saved local drafts
- **THEN** the profile workspace SHALL provide a draft entry that lists those drafts and allows reopening them

### Requirement: Notification indicators
The system SHALL provide mock notification indicators and a notification list so station reminders can be validated before backend notification services exist.

#### Scenario: Unread notifications exist
- **WHEN** the mock user has unread notifications
- **THEN** the mobile shell SHALL show a red-dot or count indicator on the relevant navigation or profile entry

#### Scenario: User opens notification list
- **WHEN** a mock user opens the notification entry
- **THEN** the app SHALL show notification title, type, related item, created time, read state, and mark-as-read behavior

### Requirement: Typed mock data layer
The system SHALL provide typed mock data for users, roles, sections, organizations, areas, disciplines, drawings, site items, photos, workflow logs, notifications, and dashboard summaries.

#### Scenario: Pages use shared mock types
- **WHEN** a page renders site item, drawing, photo, or user data
- **THEN** the page SHALL consume data from shared typed mock modules rather than defining incompatible local literals

#### Scenario: Backend contracts remain visible
- **WHEN** frontend domain types are inspected
- **THEN** they SHALL include fields needed by the development document, including section scope, drawing revision pages, item status, due dates, photo evidence snapshots, and workflow logs
