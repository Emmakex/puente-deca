# Architecture

## Product boundary

Puente DeCA is not an ERP, TMS or standalone customer platform. It is the transport-compliance engine for the **Puente DeCA product inside Kairoseth Platform**.

Kairoseth Platform owns customer identity, organizations, product activation, product-scoped RBAC, billing/entitlements and the customer workspace. This repository owns the DeCA transport domain, document engine, connector protocol and compliance evidence.

Source systems remain responsible for commercial and operational data. Puente DeCA normalizes that data into a stable transport model, validates the DeCA requirements, produces compliant documents, preserves evidence and exposes the result back to the source system.

## Layers

1. **Connectors** — WooCommerce, PrestaShop, CSV/Excel, ERP/TMS or custom integrations.
2. **Contracts** — stable API payloads independent from source platforms.
3. **Core** — transport and DeCA rules.
4. **Document engine** — native PDF, QR and unique HTTPS access URL.
5. **Persistence/audit** — shipments, versions, immutable audit events, retention and service-side organization scoping.
6. **API** — machine/service authentication, idempotency, generation, retrieval and document lifecycle.
7. **Kairoseth Platform boundary** — customer authentication, canonical organization identity and product RBAC remain outside this engine.

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
- the current QR encoder supports up to 152 UTF-8 bytes, covering the intended short Puente DeCA document URLs;
- PDFs are generated directly from structured data and include creation/modification metadata;
- a conservative 5,000,000-byte ceiling is enforced before a PDF can leave the renderer;
- legal text is never silently transliterated or replaced: unsupported characters make rendering fail closed;
- the API can return a generated PDF directly through `POST /v1/deca/pdf`.

Full Unicode font embedding and unusually long custom-domain QR payloads remain production-hardening work.

## Kairoseth Platform authority

Production customer authority is resolved by Kairoseth Platform:

```text
(userId, organizationId, productSlug="puente-deca")
  -> owner | admin | member | no-access
```

The canonical production tenant identifier is the Kairoseth Platform organization ID. The engine must never infer browser/user authorization from connector data or create a parallel customer-role model.

Machine credentials used by WooCommerce, PrestaShop and ERP connectors are service credentials scoped to one Kairoseth organization. They do not represent a human role.

## Persistence

Puente DeCA now has two storage drivers behind the same domain contract:

- **JSON store** — development and deterministic contract tests only;
- **PostgreSQL store** — production metadata, tenant scope, document lineage, idempotency and audit.

When `NODE_ENV=production`, the service refuses to start with JSON persistence unless an explicit emergency override is supplied. The canonical production tenant remains the Kairoseth organization ID.

The persistence contract enforces:

- organization/tenant ownership;
- shipment isolation between organizations;
- immutable document-version records;
- append-only audit events through the store API;
- organization-scoped idempotency keys for create operations;
- atomic replace-on-write for the development JSON store;
- PostgreSQL transactions for multi-record production mutations;
- transaction-scoped advisory locking for concurrent idempotent shipment creation;
- relational uniqueness for document versions and public access paths;
- non-cascading compliance metadata via `ON DELETE RESTRICT`.

The storage interface keeps the domain independent from the selected driver, so shipment/document contracts remain unchanged.

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
  |---- fail-closed text encoding
  |
persistence
  |---- organization
  |---- shipment
  |---- document version
  |---- audit event
  v
stored domain state
```


## Production Kairoseth topology

```text
Browser
  |
  v
kairoseth.com
  |  Better Auth + organization + product RBAC
  v
Kairoseth Puente DeCA workspace/API
  |  server-to-server authorized organization context
  v
Puente DeCA service
  |-- shipment validation
  |-- PDF/QR/versioning
  |-- retention/integrity
  |-- connector operations
  v
document storage
```

Target public document path after production proxy acceptance:

```text
https://kairoseth.com/deca/d/<opaque-token>.pdf
```

That route remains public-by-token for inspection/direct download and must not redirect through the authenticated workspace.


Production PostgreSQL configuration and migration notes are documented in [`docs/postgresql.md`](postgresql.md).
