# Spec Delta

## Purpose

Stores a person's first name, last name and optional salutation next to the display name, uses them only to greet the person in emails, and removes them wherever the account is anonymized.

## ADDED Requirements

### Requirement: Users may carry first name, last name and salutation
A user SHALL be able to carry a first name, a last name and a salutation (`mr`, `ms` or none). All three SHALL be optional for users who came in by invitation or carrier registration. The display name SHALL stay the single name shown in the app; for a self-registered user it SHALL be "<first name> <last name>".

#### Scenario: Self-registered user
- **WHEN** Jonas Petersen registers without a salutation
- **THEN** his user has first name "Jonas", last name "Petersen", no salutation and display name "Jonas Petersen"

#### Scenario: Invited user
- **WHEN** a dispatcher accepts an invitation with the name "Daniel Brandt"
- **THEN** the user has display name "Daniel Brandt" and no first name, last name or salutation

### Requirement: Salutation is never required and never inferred
The salutation SHALL be optional with "No answer" as default, SHALL offer only "Mr" and "Ms" besides it, and SHALL NOT be derived from the name, the locale or any other field.

#### Scenario: Registration without salutation
- **WHEN** a registration leaves the salutation at "No answer"
- **THEN** the user's salutation is empty and no email uses a gendered form

### Requirement: Emails greet by salutation with a neutral fallback
Emails built from these fields SHALL greet with the salutation and last name when a salutation is set, and with first and last name in a neutral form otherwise: de "Sehr geehrter Herr {last}", "Sehr geehrte Frau {last}", "Guten Tag {first} {last}"; en "Dear Mr {last}", "Dear Ms {last}", "Hello {first} {last}"; pl "Szanowny Panie", "Szanowna Pani", "Dzień dobry {first} {last}".

#### Scenario: German greeting with salutation
- **WHEN** Anna Lenz registered with salutation "Frau" on the German page
- **THEN** her verification email starts "Sehr geehrte Frau Lenz,"

#### Scenario: Neutral greeting
- **WHEN** Jonas Petersen registered without salutation on the German page
- **THEN** his verification email starts "Guten Tag Jonas Petersen,"

### Requirement: Anonymization clears the name parts
Wherever the retention job anonymizes a user instead of deleting it, it SHALL also clear the first name, last name and salutation. Deleting a user SHALL delete them with the row.

#### Scenario: Anonymized user
- **WHEN** the retention job anonymizes an inactive carrier user who had first and last name set
- **THEN** that user's first name, last name and salutation are empty
