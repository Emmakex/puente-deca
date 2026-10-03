# Roadmap

## Phase 0 — Repository foundation

- [x] Repository initialized.
- [x] Node 22 baseline.
- [x] Minimal CI lane with cancellation.
- [x] Architecture and legal traceability skeleton.
- [x] No runtime dependencies in the first vertical slice.

## Phase 1 — DeCA contract and validation

- [x] Stable request contract.
- [x] Essential-field validation.
- [x] Alternative measure support when exact weight is unavailable.
- [x] Health endpoint.
- [x] Validation endpoint.
- [x] Unit/API tests.
- [x] Conservative tax-identifier normalization (trim + uppercase only).
- [x] Registration normalization without speculative format rejection.
- [x] Responsibility-aware validation messages.

## Phase 2 — Document engine

- [x] Canonical document snapshot.
- [x] Native PDF generation.
- [x] QR generation and vector embedding.
- [x] Unique HTTPS download URL.
- [x] Maximum-size enforcement (5,000,000-byte conservative ceiling).
- [x] Creation/modification timestamps in snapshot and PDF metadata.
- [x] New-file document versioning with immutable lineage.
- [x] Deterministic content fingerprint for audit/reconciliation.
- [x] Fail-safe character handling: never silently alter unsupported legal text.
- [x] API endpoint returning the generated PDF.

**Phase 2 status: complete for the initial production-safe character set.**

Full Unicode font embedding and dynamic QR sizing for unusually long custom URLs are production-hardening tasks. Until then, unsupported characters fail closed and intended Puente DeCA URLs remain within the fixed QR capacity.

## Phase 3 — Persistence and multi-tenant core

- [x] Organizations.
- [x] API credentials with one-time secret reveal, hashed storage, scopes and revocation.
- [x] Shipments.
- [x] Document versions.
- [x] Immutable audit events through the persistence API.
- [ ] Configurable storage with minimum legal retention safeguards.
- [x] Organization-scoped idempotency keys.
- [x] Atomic JSON store for development and contract tests.
- [ ] PostgreSQL production adapter.

## Phase 4 — Operational API

- [x] POST /v1/shipments.
- [x] POST /v1/shipments/:id/deca.
- [x] GET /v1/shipments/:id.
- [x] GET /v1/deca/:id.
- [x] Driver/inspection direct PDF endpoint at the QR URL (no login).
- [x] OpenAPI 3.1 contract with CI validation.\n\n**Phase 4 status: complete for the first operational API.**

## Phase 5 — First connectors

- [ ] CSV/Excel batch import.
- [ ] WooCommerce.
- [ ] PrestaShop.
- [ ] Reference connector SDK/contract suite.

## Phase 6 — Production hardening

- [ ] Production Unicode font embedding.
- [ ] Dynamic QR sizing for unusually long custom URLs.
- [ ] PostgreSQL-backed store.
- [ ] Object storage.
- [ ] Backups/restore drill.
- [ ] Rate limits.
- [ ] Metrics and health/readiness.
- [ ] Deployment runbook.
- [ ] Security review.

## Phase 7 — Transport Compliance Engine

- [ ] Generic Shipment aggregate.
- [ ] eCMR adapter.
- [ ] eFTI compatibility track.
- [ ] Additional transport-document modules.
