# Legal and technical traceability

This file records the regulatory sources that drive implementation requirements. It is an engineering traceability document, not legal advice.

## Core data

The transport-control document for public road freight must include the essential data listed in article 6 of Orden FOM/2861/2012, as currently consolidated:

- contractual shipper: legal name, tax identifier and address;
- effective carrier: legal name and tax identifier;
- origin and destination;
- nature and weight of the goods (or another magnitude where exact weight is difficult to determine);
- special traffic authorization identification when applicable;
- transport date;
- tractor registration and trailer/semitrailer registration when applicable;
- optional observations/reservations.

Responsibility allocation was updated by Orden TRM/282/2026.

## Electronic DeCA

Implementation must also track the technical requirements established by the Resolution of 5 June 2026 (BOE-A-2026-12784), including application data availability, electronic document characteristics, creation/modification traceability, QR/HTTPS document access and retention requirements.

## Engineering rule

Every compliance rule introduced into `packages/core` or the future document engine must be traceable to:

1. a source;
2. the affected domain field or invariant;
3. a deterministic test.

## Sources

- BOE-A-2013-154 — Orden FOM/2861/2012.
- BOE-A-2026-7128 — Orden TRM/282/2026.
- BOE-A-2026-12784 — Resolution of 5 June 2026 on electronic control documents.
