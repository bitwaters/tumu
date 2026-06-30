## ADDED Requirements

### Requirement: Drawing archive preview UI
The system SHALL provide a drawing archive prototype that displays drawing names, revisions, current revision state, page count, and page preview metadata without binding site items to drawing locations.

#### Scenario: User reviews drawing metadata
- **WHEN** a user opens drawing administration
- **THEN** the UI SHALL show available drawings, revision state, and page metadata

#### Scenario: User reviews PDF pages
- **WHEN** a drawing revision has multiple mock pages
- **THEN** the UI SHALL expose page count and preview metadata for that revision

### Requirement: Drawing revision awareness
The system SHALL display drawing names, revision numbers, current revision state, page count, and page preview metadata in drawing administration.

#### Scenario: Current revision is visible
- **WHEN** a drawing has multiple revisions in mock data
- **THEN** the drawing administration view SHALL identify the current revision

### Requirement: Photo capture and upload queue prototype
The system SHALL provide a photo gallery and upload queue prototype that lets users add mock photos, see upload states, retry failed uploads, and keep uploaded photos unbound until a create, rectification, or review form selects them.

#### Scenario: User opens their gallery
- **WHEN** a user opens the photo gallery
- **THEN** the UI SHALL show only photos and active upload queue entries uploaded by that user

#### Scenario: User adds photos from capture entry
- **WHEN** a user uses the photo entry point to add mock photos
- **THEN** the UI SHALL show those photos in an upload queue before adding completed uploads to the gallery as unbound photos

#### Scenario: User retries failed upload
- **WHEN** a mock photo upload is in failed state
- **THEN** the UI SHALL provide a retry action that returns the photo to pending or complete mock state

### Requirement: Photo evidence metadata display
The system SHALL display evidence metadata for attached photos, including upload stage, uploader, upload time, section, area, discipline, and responsible organization.

#### Scenario: User binds gallery photos during item creation
- **WHEN** a user selects unbound gallery photos in the create-item form and submits the item
- **THEN** the selected photos SHALL become discovery evidence bound to the new item

#### Scenario: User selects from many unbound photos
- **WHEN** a user opens photo selection inside a form
- **THEN** the UI SHALL enter gallery selection mode, preserve the original form state, and provide search with a limited recent-photo result set

#### Scenario: Item context changes after upload
- **WHEN** a mock site item responsible organization changes after photos exist
- **THEN** the photo metadata display SHALL preserve the original responsible organization snapshot for previously attached photos
