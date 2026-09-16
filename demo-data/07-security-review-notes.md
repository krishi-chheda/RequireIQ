---
title: Security Review Meeting Notes
kind: meeting_notes
filename: 07-security-review-notes.md
author: Owen Pritchard
capturedAt: 2026-07-16
---

# Security Design Review - Session 1

Date: 16 July 2026. Attendees: Owen Pritchard (Chief Information Security
Officer, Meridian Bank), Tom Devlin (Solution Architect, Northgate Advisory),
Kenji Mori (Platform Engineering Lead, Meridian Bank).

Notes taken by Owen Pritchard.

## General position

Onboarding handles identity documents, biometric selfies and full customer
personal data. It is the highest-sensitivity data class the retail bank holds.

The platform must be secure. I will not sign off a design that treats security as
a later phase.

## Specific points raised

- Customer credentials must be stored using industry standard encryption.
- The system must encrypt all personal data at rest and in transit.
- The system must enforce multi-factor authentication for all staff users
  accessing the administration console.
- The system must log every access to a customer's identity documents, including
  the identity of the staff member and the business justification selected.
- Session tokens must expire after 15 minutes of inactivity for staff users.
- The system must not store raw identity document images for longer than is
  necessary to complete verification.

Tom asked what "longer than necessary" means in days. I said I would come back
after speaking with Ruth. This is still open.

## Penetration testing

An independent penetration test must be completed before the platform processes
live customer data. Remediation of any critical or high finding must be
completed before go-live.

## Third parties

The screening vendor connection must terminate inside Meridian's network
perimeter. No direct browser-to-vendor calls carrying customer data.

## Actions

- Owen to define the retention period for raw document images.
- Tom to produce a threat model before the end of discovery.
- Kenji to confirm the tenancy supports customer-managed encryption keys.
