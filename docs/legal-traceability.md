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

The Resolution of 5 June 2026 (BOE-A-2026-12784) drives the document-engine invariants:

- structured data must be transformed into the electronic file before the effective start of the service;
- creation date/time must be recorded;
- modification date/time must be recorded when the file changes;
- the file must be a digitally native PDF;
- the PDF must not exceed 5 MB;
- creation and modification timestamps must be PDF metadata;
- the PDF must contain a QR code with the document's unique URL;
- the repository domain may be freely chosen;
- every stored file must have a unique and specific URL;
- the URL must use HTTPS with TLS 1.2 or newer;
- invoking the URL during the transport service must directly download the PDF without login, buttons or other manual interaction;
- access protection may use encryption/tokens/expiry, but the link cannot expire before the service ends;
- the road-inspection download URL may be disabled seven natural days after the service has ended;
- the generated electronic files must be retained for at least one year by the obligated parties under the rules in the resolution.

## Modification strategy

The resolution permits two modification strategies during the service:

1. modify the existing PDF, keeping the same URL/QR and retaining old values in the file as invalidated history; or
2. generate a new PDF with all current data, give that new file a new URL/QR, and retain the original for traceability.

Puente DeCA initially implements strategy 2 because it maps cleanly to immutable document versions and audit evidence. Each new file therefore gets its own creation timestamp, document identifier and access URL, while the snapshot lineage links it to the previous version.

## Engineering rule

Every compliance rule introduced into `packages/core` or the document engine must be traceable to:

1. a source;
2. the affected domain field or invariant;
3. a deterministic test.

## Sources

- BOE-A-2013-154 — Orden FOM/2861/2012.
- BOE-A-2026-7128 — Orden TRM/282/2026.
- BOE-A-2026-12784 — Resolution of 5 June 2026 on electronic control documents.
