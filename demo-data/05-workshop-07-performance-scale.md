---
title: Workshop 07 Transcript - Performance and Scale
kind: transcript
filename: 05-workshop-07-performance-scale.md
author: Northgate Advisory
capturedAt: 2026-07-09
---

# Workshop 07 - Performance, Scale and Resilience

Date: 9 July 2026. Facilitator: Tom Devlin (Solution Architect, Northgate
Advisory). Transcribed automatically.

TOM DEVLIN (Solution Architect, Northgate Advisory): I want to leave this room
with numbers, not adjectives. Kenji, what does the traffic actually look like?

KENJI MORI (Platform Engineering Lead, Meridian Bank): Our peak is Monday
morning, roughly 08:00 to 10:00. On a normal Monday the existing origination
front end sees about 1,400 concurrent sessions. On the Monday after a marketing
push we have seen 4,100.

TOM DEVLIN: And the target state?

KENJI MORI: Product are forecasting a step change because we are removing the
branch bottleneck. The platform must support 10,000 concurrent users during the
Monday morning peak. That is the number we have been asked to build to.

TOM DEVLIN: Where did 10,000 come from?

KENJI MORI: Daniel's team modelled it off the digital-first competitors. I will
be honest, I think it is optimistic, but it is the number in the product forecast
and it is what we have been told to design for.

TOM DEVLIN: Fine, I will record it as stated. Latency?

KENJI MORI: The system must return 95% of API responses within 500 milliseconds
under normal operating load.

TOM DEVLIN: Normal being the 1,400 figure or the 10,000 figure?

KENJI MORI: Normal being everyday load. Under peak we would accept degradation as
long as nothing times out.

TOM DEVLIN: What about the full journey?

KENJI MORI: Onboarding application submission must complete within 90 seconds end
to end, including the identity and screening calls. The screening vendor is the
long pole there.

TOM DEVLIN: Scaling approach?

KENJI MORI: The system should scale horizontally without a service interruption.
We are on the private cloud tenancy so that means adding pods, and we need the
autoscaler configured properly this time.

TOM DEVLIN: Resilience?

KENJI MORI: The platform must achieve 99.99% availability measured monthly,
excluding planned maintenance windows. That is the tier-1 service standard and
onboarding has been classified tier-1.

TOM DEVLIN: That is 4.3 minutes of unplanned downtime a month. You are confident
the tenancy supports that?

KENJI MORI: With multi-zone, yes. Single zone, no.

TOM DEVLIN: Then the platform must be deployed across at least two availability
zones. I am recording that as a derived requirement, it follows from the
availability target rather than from anyone asking for it directly.

KENJI MORI: Agreed. One more. The system must process at least 2,000 account
activations per hour at peak so we do not build a queue behind the screening
step.
