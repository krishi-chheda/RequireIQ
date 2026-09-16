---
title: Product Specification v0.4 (extract)
kind: specification
filename: 08-product-specification-v04.md
author: Daniel Okafor
capturedAt: 2026-07-21
---

# Customer Onboarding Platform - Product Specification v0.4

Status: draft, circulated for comment. Sections 1 to 3 omitted from this extract.

## Section 4 - Non-functional characteristics

### 4.1 Availability

The service is classified tier-1. The platform must achieve 99.99% availability
measured monthly, excluding agreed planned maintenance windows.

### 4.2 Capacity and throughput

The service must sustain 10,000 concurrent sessions at peak without degradation
of the published latency targets.

Capacity headroom of 30% above forecast peak must be maintained at all times.

### 4.3 Latency

The system must return 95% of API responses within 500 milliseconds under normal
operating load. The 99th percentile must remain below 1,500 milliseconds.

### 4.4 Recoverability

The recovery point objective for customer application data must not exceed 5
minutes.

## Section 5 - Functional summary

### 5.1 Application capture

The system must allow a customer to complete a personal current account
application entirely online.

The system must validate the applicant's address against the Royal Mail postcode
address file.

### 5.2 Decisioning

The system must apply the bank's published eligibility criteria automatically and
return a decision without manual intervention in at least 80% of applications.

The system must allow an underwriter to review and override an automated
decision.

### 5.3 Integration

The system must publish an account activation event to the core banking platform
within 15 minutes of activation.

The system must integrate with the incumbent screening vendor using the existing
enterprise service bus.

## Section 6 - Assumptions

The following are assumptions carried by the product team. They have not been
independently verified.

- It is assumed the screening vendor can sustain the peak throughput implied by
  section 4.2.
- It is assumed the private cloud tenancy supports multi-zone deployment without
  a commercial change.
- It is assumed existing customer records are of sufficient quality to support
  pre-fill without manual correction.
