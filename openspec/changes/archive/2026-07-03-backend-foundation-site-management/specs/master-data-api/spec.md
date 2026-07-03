## ADDED Requirements

### Requirement: Master data read APIs
The API SHALL expose section, organization, area, and discipline list endpoints for forms, filters, and administration pages.

#### Scenario: List active master data
- **WHEN** an authenticated user requests section, organization, area, or discipline options
- **THEN** the API returns only records visible within that user's project and section scope, excluding inactive records by default

#### Scenario: Include inactive records for administration
- **WHEN** an administrator requests master data with `includeInactive=true`
- **THEN** the API includes inactive records in the response

### Requirement: Master data write APIs
The API SHALL restrict section, organization, area, and discipline create/update operations to administrators.

#### Scenario: Create master data record
- **WHEN** an administrator creates a valid section, organization, area, or discipline
- **THEN** the API persists the record, returns it, and writes an audit log

#### Scenario: Update master data record
- **WHEN** an administrator updates name, code, active state, or relationships for a master data record
- **THEN** the API validates referential integrity, persists the update, and writes an audit log

#### Scenario: Non-admin write rejected
- **WHEN** a non-admin user attempts to create or update master data
- **THEN** the API returns 403 and does not mutate data

### Requirement: Master data referential safety
Master data updates SHALL not break existing site item history or photo metadata snapshots.

#### Scenario: In-use master data can be deactivated but not deleted
- **WHEN** a master data record is referenced by existing site items, photos, workflow logs, or audit records
- **THEN** the API allows deactivation where valid but does not hard-delete the referenced record
