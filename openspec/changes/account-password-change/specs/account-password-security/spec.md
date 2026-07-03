## ADDED Requirements

### Requirement: Current User Password Change
The system SHALL allow an authenticated active user to change their own password by providing the current password and a new password.

#### Scenario: Successful password change
- **WHEN** an authenticated user submits the correct current password and a valid new password
- **THEN** the API updates that user's password hash and returns success without exposing the hash

#### Scenario: Incorrect current password rejected
- **WHEN** an authenticated user submits an incorrect current password
- **THEN** the API rejects the request and keeps the existing password unchanged

#### Scenario: Unauthenticated password change rejected
- **WHEN** a request without a valid session attempts to change a password
- **THEN** the API rejects the request without modifying any user record

### Requirement: Password Change Audit
The system SHALL write an audit record when a user successfully changes their own password.

#### Scenario: Audit record created
- **WHEN** a password change succeeds
- **THEN** the audit log contains a `change_password` record for the current user

### Requirement: Profile Password Form
The frontend SHALL replace the profile password placeholder with a form that submits the current password and new password to the backend.

#### Scenario: Profile password form succeeds
- **WHEN** the user submits matching new-password confirmation and the backend accepts the password change
- **THEN** the frontend shows success behavior by clearing the session and returning the user to login

#### Scenario: Profile password form validation
- **WHEN** the new password and confirmation do not match
- **THEN** the frontend blocks submission and shows an inline error
