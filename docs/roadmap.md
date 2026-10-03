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

Full Unicode font embedding remains a production-hardening task.

## Phase 3 — Persistence and service-side tenant core

> Production customer identity/organizations/RBAC are owned by Kairoseth Platform. Local organizations and API credentials in this repository are development/service-contract primitives, not a second customer account system.

- [x] Organizations.
- [x] API credentials with one-time secret reveal, hashed storage, scopes and revocation.
- [x] Shipments.
- [x] Document versions.
- [x] Immutable audit events through the persistence API.
- [x] Per-artifact retention floor recorded from the transport date.
- [x] Organization-scoped idempotency keys.
- [x] Atomic JSON store for development and contract tests.
- [x] Retention-aware PDF purge policy with dry-run default, explicit confirmation, immutable metadata and audit evidence.
- [x] MongoDB Atlas production adapter aligned with Kairoseth Platform.
- [ ] Live MongoDB Atlas transaction/index smoke acceptance.

## Phase 4 — Operational API

- [x] POST /v1/shipments.
- [x] POST /v1/shipments/:id/deca.
- [x] GET /v1/shipments/:id.
- [x] PUT /v1/shipments/:id with audited operational updates.
- [x] GET /v1/deca/:id.
- [x] Driver/inspection direct PDF endpoint at the QR URL (no login).
- [x] Public QR endpoint supports a path prefix in PUBLIC_BASE_URL.
- [x] Repeated generation reuses the current document when shipment content is unchanged.
- [x] OpenAPI 3.1 contract with CI validation.

**Phase 4 status: complete for the first operational API.**

## Phase 5 — First connectors

- [x] CSV batch import with row-level validation.
- [x] Excel (.xlsx) batch import using the same mapping/validation contract.
- [x] WooCommerce plugin: HPOS/CRUD, encrypted API key, manual/automatic generation and revision flow.
- [x] PrestaShop module v0.1.0: encrypted connector key, manual/opt-in automation, shipment update/revision flow and shared connector contract.
- [x] Reference connector SDK/contract suite.

## Phase 6 — Kairoseth Platform integration + production hardening

- [x] Canonical product identity fixed as `extensions/puente-deca`.
- [x] Kairoseth Platform declared authoritative for customer auth, organizations and product RBAC.
- [x] Server-to-server Kairoseth → Puente DeCA organization context with dedicated shared-secret authentication.
- [x] Platform UX to issue/revoke organization-scoped connector credentials.
- [x] Platform-only connector credential API: create/list/revoke with one-time secret reveal.
- [x] Puente DeCA workspace inside `/app/organizations/:slug/products/puente-deca`.
- [x] Kairoseth public proxy route implemented at `https://kairoseth.com/deca/d/<token>.pdf`; live production wiring/acceptance remains pending.
- [ ] Disable standalone customer/bootstrap semantics in production.
- [x] Organization-scoped shipment listing for the Kairoseth workspace.

### Runtime hardening

- [ ] Production Unicode font embedding.
- [x] Automatic QR version sizing (1–40) with ECC M and a pinned encoder dependency.
- [x] Dependency lockfile, npm cache and reproducible `npm ci` install for runtime/XLSX dependencies.
- [x] WooCommerce deterministic release ZIP packaging with SHA-256 manifest.
- [ ] WooCommerce live-store smoke test.
- [x] PrestaShop deterministic release ZIP packaging with SHA-256 manifest.
- [ ] PrestaShop real 1.7.8/8.x compatibility matrix.
- [x] MongoDB Atlas metadata store aligned with Kairoseth Platform.
- [ ] Production Atlas transaction/index smoke acceptance.
- [ ] GridFS backup/restore acceptance.
- [x] MongoDB Atlas GridFS PDF artifact storage aligned with Kairoseth Platform.
- [x] Artifact reconciliation tooling for premature loss, post-retention loss, orphans and incomplete purges.
- [ ] Live GridFS upload/read/delete and orphan-reconciliation smoke acceptance.
- [x] MongoDB Atlas + GridFS backup/restore runbook.
- [ ] Live backup/restore drill against a staging/DR Atlas target.
- [x] Per-organization/per-credential authenticated API rate limiting with 429 + Retry-After.
- [ ] Edge/reverse-proxy volumetric protection for public QR and unauthenticated abuse.
- [x] Separate liveness/readiness probes plus protected low-cardinality Prometheus process metrics.
- [x] Production preflight and deployment/runback acceptance runbook.
- [ ] Live deployment acceptance on the chosen internal service runtime.
- [ ] Security review.

## Phase 7 — Transport Compliance Engine

- [ ] Generic Shipment aggregate.
- [ ] eCMR adapter.
- [ ] eFTI compatibility track.
- [ ] Additional transport-document modules.
