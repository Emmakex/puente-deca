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
- [ ] Normalize Spanish tax identifiers without over-validating foreign parties.
- [ ] Registration normalization and articulated-vehicle rules.
- [ ] Responsibility-aware validation messages.

## Phase 2 — Document engine

- [ ] Canonical document snapshot.
- [ ] Native PDF generation.
- [ ] QR generation.
- [ ] Unique HTTPS download URL.
- [ ] Maximum-size enforcement.
- [ ] Creation/modification timestamps.
- [ ] Document versioning.

## Phase 3 — Persistence and multi-tenant core

- [ ] Organizations.
- [ ] API credentials.
- [ ] Shipments.
- [ ] Document versions.
- [ ] Immutable audit events.
- [ ] Configurable storage with minimum legal retention safeguards.
- [ ] Idempotency keys.

## Phase 4 — Operational API

- [ ] POST /v1/shipments.
- [ ] POST /v1/shipments/:id/deca.
- [ ] GET /v1/shipments/:id.
- [ ] GET /v1/deca/:id.
- [ ] Driver-friendly document endpoint.
- [ ] OpenAPI contract.

## Phase 5 — First connectors

- [ ] CSV/Excel batch import.
- [ ] WooCommerce.
- [ ] PrestaShop.
- [ ] Reference connector SDK/contract suite.

## Phase 6 — Production hardening

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
