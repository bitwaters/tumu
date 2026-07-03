# closeout-export-jobs Specification

## Purpose
Defines production-ready export jobs for site item ledgers, photo packages, single-item PDF closeout sheets, and audit logs.

## Requirements
### Requirement: Site Item Ledger Export
The system SHALL allow authorized users to create a scoped site item ledger export containing item number, type, status, severity, title, description, section, area, discipline, responsible organization, responsible user, creator, created time, due time, submitted review time, closed time, overdue flag, photo count, and latest workflow comment.

#### Scenario: Scoped ledger export
- **WHEN** a supervisor, administrator, or contractor manager creates a site item ledger export
- **THEN** the generated file includes only site items visible to that user according to server-side authorization scope

#### Scenario: Unauthorized ledger export
- **WHEN** an unauthorized role attempts to create a ledger export
- **THEN** the API rejects the request and no export file is created

### Requirement: Photo Package Export
The system SHALL allow authorized users to create a photo package export grouped by site item number with discovery, rectification, and review photo files plus a manifest describing photo-to-item relationships.

#### Scenario: Photo package contains manifest
- **WHEN** a photo package export succeeds
- **THEN** the artifact contains a manifest file listing each included item, photo file name, photo stage, uploader, uploaded time, and snapshot metadata

### Requirement: Single Item PDF Closeout
The system SHALL allow authorized users to create a single site item PDF closeout sheet containing item metadata, problem description, responsibility data, workflow logs, photo evidence references, and closeout signoff evidence based on system logs.

#### Scenario: Closed item PDF
- **WHEN** an authorized user creates a PDF closeout sheet for a visible item
- **THEN** the generated PDF includes workflow log actors, timestamps, comments, status transitions, and grouped photo evidence

### Requirement: Audit Export
The system SHALL allow administrators to export audit logs using the same supported audit filters as the audit list API.

#### Scenario: Admin audit export
- **WHEN** an administrator creates an audit export with filters
- **THEN** the generated file includes only audit records matching those filters

### Requirement: Export Job Status And Download
The system SHALL expose export job status and download endpoints that show queued, running, succeeded, or failed state, requested type, requester, timestamps, error messages, and download availability.

#### Scenario: Download completed export
- **WHEN** an authorized requester opens a succeeded export job
- **THEN** the API returns a download URL or file response for the generated artifact

#### Scenario: Download forbidden export
- **WHEN** a user who cannot access an export job attempts to download it
- **THEN** the API rejects the request without exposing artifact metadata
