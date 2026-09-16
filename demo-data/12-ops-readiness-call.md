---
title: Operational Readiness Call Transcript
kind: transcript
filename: 12-ops-readiness-call.md
author: Northgate Advisory
capturedAt: 2026-07-30
---

# Operational Readiness Call

Date: 30 July 2026. Dial-in. Transcribed automatically.

GRACE ADEYEMI (Service Operations Manager, Meridian Bank): My concern is what
happens at 3am when this breaks and my team has to deal with it.

TOM DEVLIN (Solution Architect, Northgate Advisory): Fair. What do you need?

GRACE ADEYEMI: The platform should provide high availability. That is the first
thing.

TOM DEVLIN: Kenji gave me 99.99% monthly in Workshop 07. Is that the same thing
you mean?

GRACE ADEYEMI: I think so, but I would want to see it written down against a
measurement window. People say high availability and mean very different things.

GRACE ADEYEMI: Recovery. The recovery time objective must be under 4 hours for a
full service restoration.

TOM DEVLIN: Under four hours for full restoration, understood. I will note that
sits alongside the availability target rather than replacing it.

GRACE ADEYEMI: Monitoring. The system must emit health and error metrics to the
existing observability platform. If it does not appear on our dashboards it does
not exist as far as my team is concerned.

GRACE ADEYEMI: The system must raise an alert to the on-call channel within 2
minutes of an application submission failure rate exceeding 5% over a rolling 5
minute window.

TOM DEVLIN: That is specific, thank you.

GRACE ADEYEMI: We learned that one the hard way on the payments migration.

GRACE ADEYEMI: Runbooks. The supplier must provide operational runbooks for every
alert condition before the platform enters production.

GRACE ADEYEMI: Maintenance. Planned maintenance must be performed within the
agreed change window of Sunday 02:00 to 06:00.

TOM DEVLIN: Anything on capacity management?

GRACE ADEYEMI: The system should provide capacity headroom reporting so we can
see the trend before we hit a wall. Nothing fancy, a weekly number is fine.

TOM DEVLIN: Noted. Support model?

GRACE ADEYEMI: Third line stays with the build team for the first six months
after go-live. That is a commercial point for Helena, but operationally I need it.
