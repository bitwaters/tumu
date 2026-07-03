# frontend-photo-integration Specification

## Purpose
Defines frontend integration for the personal photo gallery, presigned uploads, preview loading, unbound photo selection, and photo deletion.
## Requirements
### Requirement: API-Backed Personal Gallery
The frontend SHALL load the current user's photo gallery from `/photos` and keep unbound photo selection scoped to the current user.

#### Scenario: Open gallery
- **WHEN** the user opens the photo tab
- **THEN** the frontend loads `/photos` and renders current-user visible photos newest first

#### Scenario: Select photos for a form
- **WHEN** a create, rectification, or review form enters photo selection mode
- **THEN** the frontend loads `/photos?unboundOnly=true` and lets the user confirm selected photo IDs before returning to the form

### Requirement: Presign And Complete Upload Flow
The frontend SHALL upload photos through the backend presign and complete-upload endpoints.

#### Scenario: Successful upload
- **WHEN** the user adds a photo file
- **THEN** the frontend requests `/photos/presign`, uploads the object to the returned target, calls `/photos/complete`, and adds the returned photo to the gallery

#### Scenario: Upload failure
- **WHEN** object upload or complete-upload fails
- **THEN** the upload queue marks the item failed and offers retry without creating duplicate gallery records

#### Scenario: Retry complete upload
- **WHEN** complete-upload is retried for the same file action
- **THEN** the frontend reuses the same idempotency key

### Requirement: Photo Preview And Delete
The frontend SHALL use backend preview and delete endpoints for photo inspection and gallery cleanup.

#### Scenario: Preview photo
- **WHEN** the user clicks preview for a photo
- **THEN** the frontend calls `/photos/:id/preview` and displays the returned preview URL

#### Scenario: Delete unneeded photo
- **WHEN** the user deletes a permitted gallery photo
- **THEN** the frontend calls `DELETE /photos/:id` with an idempotency key and removes or marks the photo deleted in the gallery

### Requirement: Bound Photo Evidence
The frontend SHALL display bound photo evidence from site item detail rather than assuming current gallery state.

#### Scenario: Item detail evidence
- **WHEN** item detail contains grouped discovery, rectification, or review photos
- **THEN** the frontend renders those grouped photos with snapshot metadata returned by the backend
