# user-ui-preferences Specification

## Purpose

Stores small pieces of per-user UI state on the server, so that a user who signs in on another computer finds the screens as they left them.

## Requirements

### Requirement: UI preferences are a typed set of keys
The system SHALL know a fixed set of UI preference keys, each with its own value schema. The first keys are `platform.packages.openModules` and `platform.tenant.openModules`, each a list of module ids without duplicates.

#### Scenario: Known key with a valid value
- **WHEN** the signed-in user sends `PATCH /api/me` with `{ "uiPrefs": { "platform.packages.openModules": ["yard", "safety"] } }`
- **THEN** the response is 200 and its `uiPrefs` contains that list

#### Scenario: Unknown key
- **WHEN** the user sends `uiPrefs` with the key `platform.unknown`
- **THEN** the response is 422 with an `unrecognized_keys` issue at the zod path `["uiPrefs"]` whose message names the key `platform.unknown`, and nothing is stored

#### Scenario: Invalid value
- **WHEN** the user sends `{ "uiPrefs": { "platform.packages.openModules": ["nope"] } }`
- **THEN** the response is 422 with a path under `["uiPrefs", "platform.packages.openModules"]` and nothing is stored

### Requirement: The current user reads their preferences
`GET /api/me` and the response of `PATCH /api/me` SHALL include `uiPrefs`, an object holding every stored key that is known and valid. A user who never stored a preference SHALL get `{}`.

#### Scenario: New user
- **WHEN** a user who never stored a preference calls `GET /api/me`
- **THEN** `uiPrefs` is `{}`

#### Scenario: Stale stored key
- **WHEN** the stored preferences hold a key that is no longer known, or a value that no longer matches its schema
- **THEN** `GET /api/me` leaves that key out and answers 200

### Requirement: Writes merge per key
`PATCH /api/me` SHALL replace only the keys present in `uiPrefs` and keep every other stored key. Two writes of different keys, in any order and from any number of browsers, SHALL both be kept.

#### Scenario: Two keys from two browsers
- **WHEN** browser A stores `platform.packages.openModules` and then browser B stores `platform.tenant.openModules`
- **THEN** `GET /api/me` returns both keys with the values A and B wrote

#### Scenario: Name change keeps preferences
- **WHEN** the user sends `PATCH /api/me` with only `{ "name": "New name" }`
- **THEN** the stored `uiPrefs` are unchanged

### Requirement: Only the user writes their preferences
Only the signed-in user SHALL write their own UI preferences, through `PATCH /api/me`. No other route SHALL change them. Preferences SHALL be readable wherever the user row is readable; they SHALL NOT hold secrets or personal data beyond UI state.

#### Scenario: Another user cannot write
- **WHEN** user B is signed in and sends `PATCH /api/me` with `uiPrefs`
- **THEN** only user B's preferences change and user A's are unchanged
