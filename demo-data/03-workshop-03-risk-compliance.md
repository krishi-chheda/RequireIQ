---
title: Workshop 03 Notes - Risk, KYC and Financial Crime
kind: meeting_notes
filename: 03-workshop-03-risk-compliance.md
author: Sofia Lindqvist
capturedAt: 2026-06-24
---

# Workshop 03 - Risk, KYC and Financial Crime

Date: 24 June 2026. Attendees: Sofia Lindqvist (Head of Financial Crime
Compliance, Meridian Bank), Priya Raghavan (Northgate Advisory), Tom Devlin
(Solution Architect, Northgate Advisory), Ruth Menzies (Data Protection Officer,
Meridian Bank, part session).

These are working notes taken in the room. They were not circulated as formal
minutes and have not been incorporated into the product specification.

## Identity and screening

Sofia walked through the regulatory position. The bank operates under the Money
Laundering Regulations and its own internal financial crime standard MB-FC-004.

- The system must complete identity verification against the sanctions and AML
  watchlist before an account is activated. Sofia was explicit that activation
  before screening completes is not acceptable under any circumstances.
- The system must screen every applicant for politically exposed person status
  at application and re-screen on a rolling 12-month cycle.
- The system must retain a full audit trail of every KYC decision, including
  which rule fired, the data the decision was based on, and the operator who
  overrode it where an override occurred.
- Where an automated screening decision is overridden, the system must record
  the identity of the approver and a free-text justification.

Sofia: "If the regulator asks me in two years why we opened an account for
someone, I need to be able to answer that in five minutes, not five weeks."

## Suspicious activity

- The system must allow a financial crime analyst to place an application on
  hold without notifying the applicant of the reason.

Tom flagged that "without notifying the applicant" has UI implications - the
status shown to the customer must not reveal a financial crime hold. Sofia
confirmed the customer-visible status should read as "in review".

## Data handling

Ruth joined for twenty minutes.

- Customer identity records must be retained for seven years from the date of
  account closure, per the bank's records retention schedule.

Ruth noted she would come back separately on abandoned applications because the
position there is different and she wanted to check it with legal first.

## Open items

Sofia asked that these notes be worked into the specification before build
starts. Priya to action.
