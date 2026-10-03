# Architecture

## Product boundary

Puente DeCA is not an ERP or TMS. It is a transport-compliance bridge.

Source systems remain responsible for commercial and operational data. Puente DeCA normalizes that data into a stable transport model, validates the DeCA requirements, produces compliant documents, preserves evidence and exposes the result back to the source system.

## Layers

1. **Connectors** — WooCommerce, PrestaShop, CSV/Excel, ERP/TMS or custom integrations.
2. **Contracts** — stable API payloads independent from source platforms.
3. **Core** — transport and DeCA rules.
4. **Document engine** — native PDF, QR and unique HTTPS access URL.
5. **Persistence/audit** — organizations, shipments, versions, immutable audit events and retention.
6. **API** — authentication, idempotency, generation, retrieval and document lifecycle.

## Domain model direction

The long-term root aggregate is `Shipment`, not `DecaDocument`.

A shipment may later produce multiple regulatory representations:

- Spain DeCA
- eCMR
- eFTI-compatible representations
- other transport documents

This prevents the platform from becoming coupled to a single regulation.

## Document engine

The initial document engine deliberately avoids external SaaS dependencies:

- document URLs use high-entropy tokens over HTTPS;
- QR codes are generated locally in byte mode with QR version 8 / error correction M;
- the generated QR is embedded as vector geometry in the PDF, keeping it crisp for print and mobile inspection;
- the current QR encoder supports up to 152 UTF-8 bytes, comfortably covering the intended short Puente DeCA document URLs;
- PDFs are generated directly from structured data and include creation/modification metadata;
- a conservative 5,000,000-byte ceiling is enforced before a PDF can leave the renderer.

For unusually long custom domains/paths, dynamic QR-version selection remains a production-hardening task.

## Persistence

The first persistence implementation is an atomic JSON store intended for development, contract testing and the initial single-process deployment path.

It already enforces the domain behavior that must survive the later PostgreSQL migration:

- organization/tenant ownership;
- shipment isolation between organizations;
- immutable document-version records;
- append-only audit events through the store API;
- organization-scoped idempotency keys for create operations;
- atomic replace-on-write to avoid partially written state files.

The storage interface deliberately keeps the domain independent from PostgreSQL. Production hardening will replace the backing store without changing the shipment/document contracts.

## Current flow

```text
request
  |
normalize + validate
  |
canonical snapshot
  |---- content fingerprint
  |---- unique HTTPS URL
  |---- immutable version lineage
  |
native PDF renderer
  |---- PDF metadata
  |---- embedded QR
  |---- 5 MB size guard
  |
persistence
  |---- organization
  |---- shipment
  |---- document version
  |---- audit event
  v
stored domain state
```
