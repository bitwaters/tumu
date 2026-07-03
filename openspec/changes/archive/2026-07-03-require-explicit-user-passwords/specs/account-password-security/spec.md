## ADDED Requirements

### Requirement: Explicit Administrative Password Assignment
The system SHALL require administrators and import jobs to provide an explicit non-empty password when creating users, resetting passwords, or importing users, and SHALL NOT silently assign shared default passwords.

#### Scenario: Create user without password rejected
- **WHEN** an administrator submits a create-user request without a password value
- **THEN** the API rejects the request and no user is created

#### Scenario: Reset password without password rejected
- **WHEN** an administrator submits a reset-password request without a password value
- **THEN** the API rejects the request and keeps the user's current password unchanged

#### Scenario: Import user without password rejected
- **WHEN** a user import row omits the password field or leaves it blank
- **THEN** the import validation reports a row-level password error and does not create that user

#### Scenario: Frontend requires explicit password
- **WHEN** an administrator opens the create-user or reset-password form
- **THEN** the frontend shows an empty required password field and does not describe any implicit default password
