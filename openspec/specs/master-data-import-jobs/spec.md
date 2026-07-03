# master-data-import-jobs Specification

## Purpose
Defines administrator-only batch import jobs for project master data and users, including row validation, idempotency, audit records, and result reporting.

## Requirements
### Requirement: Master Data Import Jobs
The system SHALL allow administrators to create import jobs for organizations, sections, areas, disciplines, and users from CSV or Excel-compatible tabular files.

#### Scenario: Admin imports master data
- **WHEN** an administrator uploads a valid import file for a supported master-data kind
- **THEN** the system validates rows, applies accepted rows, records the import job, and returns accepted and rejected row counts

#### Scenario: Non-admin import rejected
- **WHEN** a non-admin attempts to create an import job
- **THEN** the API rejects the request and no data is written

### Requirement: Import Row Validation
The system SHALL validate required columns, unique codes or usernames, role values, organization types, active flags, phone format where present, and section scope references before applying each row.

#### Scenario: Invalid rows reported
- **WHEN** an import file contains invalid rows
- **THEN** the import result includes row numbers, field names, and actionable error messages for every rejected row

### Requirement: Import Idempotency And Audit
The system SHALL make import creation idempotent per request key and SHALL write audit records for applied rows.

#### Scenario: Retry same import request
- **WHEN** the same import request is retried with the same idempotency key
- **THEN** the API returns the original import job result without applying duplicate rows

### Requirement: Import Job Status
The system SHALL expose import job status endpoints showing type, status, requester, created time, completed time, accepted rows, rejected rows, and validation errors.

#### Scenario: View import result
- **WHEN** an administrator opens an import job result
- **THEN** the response includes status, counts, and row-level validation details without exposing user password hashes
