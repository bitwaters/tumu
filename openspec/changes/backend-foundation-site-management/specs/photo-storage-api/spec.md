## ADDED Requirements

### Requirement: Presigned photo upload
The API SHALL support requesting an upload target for a photo through S3-compatible object storage.

#### Scenario: Request photo presign
- **WHEN** an authenticated user calls `POST /photos/presign` with valid file metadata
- **THEN** the API returns an upload URL or upload instructions and an object key that is not guessable

#### Scenario: Reject unsupported photo
- **WHEN** a user requests upload for an unsupported MIME type or oversized file
- **THEN** the API rejects the request before object storage upload

### Requirement: Complete photo upload
The API SHALL create a PhotoAttachment record after object storage upload is completed.

#### Scenario: Complete unbound photo upload
- **WHEN** an authenticated user calls `POST /photos/complete` with a valid object key and idempotency key
- **THEN** the API creates one unbound photo in that user's personal gallery

#### Scenario: Duplicate complete upload
- **WHEN** the same complete-upload request is retried with the same idempotency key
- **THEN** the API returns the original PhotoAttachment and does not create a duplicate

### Requirement: Personal gallery
The API SHALL expose a current-user photo gallery with search and binding filters.

#### Scenario: List personal photos
- **WHEN** a user calls `GET /photos`
- **THEN** the API returns only photos uploaded by that user unless the user has administrator-level photo access

#### Scenario: List unbound photos for picker
- **WHEN** a user requests unbound photos for form selection
- **THEN** the API returns only that user's unbound photos, ordered newest first, with pagination or a default limit

### Requirement: Photo binding to site items
The API SHALL bind selected photos to authorized site items and write binding metadata snapshots.

#### Scenario: Bind discovery photos on create
- **WHEN** selected unbound photos are submitted with a new item
- **THEN** the API binds them to the item as discovery photos with section, area, discipline, and responsible organization snapshots

#### Scenario: Bind rectification photos on review submit
- **WHEN** an assigned rectifier submits selected unbound photos during submit review
- **THEN** the API binds them as rectification photos

#### Scenario: Reject binding another user's photo
- **WHEN** a user attempts to bind a photo uploaded by another user
- **THEN** the API rejects or ignores that photo without changing its binding

### Requirement: Photo preview access
The API SHALL provide authorized preview access to stored photos.

#### Scenario: Preview authorized photo
- **WHEN** a user requests preview for their own gallery photo or an authorized item photo
- **THEN** the API returns a short-lived preview URL or proxied preview response

#### Scenario: Preview unauthorized photo
- **WHEN** a user requests preview for an unauthorized photo
- **THEN** the API returns 404 or 403
