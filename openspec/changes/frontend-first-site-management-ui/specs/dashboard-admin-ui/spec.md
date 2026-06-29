## ADDED Requirements

### Requirement: Desktop dashboard
The system SHALL provide a desktop dashboard using mock data with summary cards, status distribution, overdue counts, area statistics, discipline statistics, and responsible-organization ranking.

#### Scenario: Manager opens dashboard
- **WHEN** a manager opens the desktop dashboard
- **THEN** the page SHALL show total items, open items, pending review items, overdue items, and closed items using consistent status colors

#### Scenario: Manager changes filters
- **WHEN** a manager filters by section, area, discipline, organization, or status
- **THEN** the dashboard SHALL update visible mock statistics consistently with the filtered item list

### Requirement: Desktop item management
The system SHALL provide a desktop item management page with dense table-like display, filters, detail access, and mock export action entry points.

#### Scenario: User reviews table
- **WHEN** the item management page contains many mock site items
- **THEN** the table SHALL show item number, type, status, severity, title, section, area, discipline, organization, responsible user, due date, and photo count

### Requirement: Administration pages
The system SHALL provide desktop administration pages for drawings, master data, users, imports/exports, and audit logs using mock data.

#### Scenario: Admin opens master data
- **WHEN** an admin opens the master data page
- **THEN** the page SHALL show sections, organizations, areas, and disciplines with create or edit entry points represented in the UI

#### Scenario: Admin opens users
- **WHEN** an admin opens the users page
- **THEN** the page SHALL show user role, organization, active state, and section scope information from mock data

#### Scenario: Admin opens imports and exports
- **WHEN** an admin opens the imports/exports page
- **THEN** the page SHALL show mock import records, export jobs, statuses, and download action placeholders

#### Scenario: Admin opens audit logs
- **WHEN** an admin opens the audit log page
- **THEN** the page SHALL support filtering mock audit records by user, time, resource type, and action type
