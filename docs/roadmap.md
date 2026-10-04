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

**Phase 2 status: complete for the production Noto Sans Unicode coverage used by Puente DeCA.**

Characters outside the embedded font set continue to fail closed rather than being transliterated or replaced.

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
- [x] Automated Atlas/GridFS live smoke command with rollback and cleanup.
- [x] Automated Atlas concurrency smoke for idempotent shipment creation and document-version lineage with scoped cleanup.
- [ ] Live MongoDB Atlas transaction/index/concurrency smoke acceptance (fail-closed checks implemented; pending execution against the intended Atlas environment).

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
- [x] Kairoseth public proxy route implemented at `https://kairoseth.com/deca/d/<token>.pdf` with canonical `.pdf` suffix handling.
- [x] Credential-free live public-PDF smoke command for TLS/path/PDF/SHA-256/privacy-header acceptance.
- [ ] Live production public-route wiring/acceptance.
- [x] Disable standalone DeCA laboratory/bootstrap surface in production; Kairoseth/connector operational routes remain authoritative.
- [x] Organization-scoped shipment listing for the Kairoseth workspace.

### Runtime hardening

- [x] Production Unicode font embedding with pre-subset Noto Sans/Fontsource files and fail-closed unsupported-character handling.
- [x] Automatic QR version sizing (1–40) with ECC M and a pinned encoder dependency.
- [x] Dependency lockfile, npm cache and reproducible `npm ci` install for runtime/XLSX dependencies.
- [x] WooCommerce deterministic release ZIP packaging with SHA-256 manifest.
- [x] Dedicated reproducible connector release workflow with uploaded ZIP/checksum bundle.
- [x] Extracted release-ZIP PHP runtime bootstrap acceptance for WooCommerce and PrestaShop.
- [x] Release-candidate evidence bundle with deterministic CycloneDX SBOM and SHA-256 release manifest.
- [x] WooCommerce executable PHP host-contract bootstrap smoke (HPOS/hooks/encryption/connection/payload).
- [ ] WooCommerce live-store smoke test (read-only live-store automation implemented; pending execution inside an approved store).
- [x] PrestaShop deterministic release ZIP packaging with SHA-256 manifest.
- [x] PrestaShop executable PHP host-contract bootstrap matrix for 1.7.8.0 and 8.1.2.
- [ ] PrestaShop real 1.7.8.x/8.x compatibility matrix (read-only live-store automation implemented; pending execution on approved 1.7.8.x and 8.x stores).
- [x] MongoDB Atlas metadata store aligned with Kairoseth Platform.
- [ ] Production Atlas transaction/index/concurrency smoke acceptance.
- [ ] GridFS backup/restore acceptance.
- [x] MongoDB Atlas GridFS PDF artifact storage aligned with Kairoseth Platform.
- [x] Artifact reconciliation tooling for premature loss, post-retention loss, orphans and incomplete purges.
- [ ] Live GridFS upload/read/delete and orphan-reconciliation smoke acceptance.
- [x] MongoDB Atlas + GridFS backup/restore runbook.
- [x] Guarded logical backup + isolated DR restore automation with SHA-256, metadata↔GridFS reconciliation, per-artifact link verification and failure-path DR cleanup.
- [ ] Live backup/restore drill against a staging/DR Atlas target (automation complete; pending execution with the intended DR Atlas target).
- [x] Per-organization/per-credential authenticated API rate limiting with 429 + Retry-After.
- [x] Kairoseth application-level public PDF concurrency guard (default 16 / max 64 per process) with 503 + Retry-After and no IP coupling.
- [x] Kairoseth DeCA public-route changes are covered by the Hostinger Production Smoke path.
- [ ] Hostinger CDN/WAF edge-level volumetric protection for public QR and unauthenticated abuse.
- [x] Separate liveness/readiness probes plus protected low-cardinality Prometheus process metrics.
- [x] Credentialed live Kairoseth→Puente DeCA protected-health smoke command.
- [x] Production preflight and deployment/runback acceptance runbook.
- [x] One-command automated core go-live acceptance with no skip/bypass controls and explicit remaining manual gates.
- [x] Local Kairoseth↔engine E2E contract: tenant-scoped shipment → DeCA → public PDF → SHA-256 → cross-organization isolation.
- [x] Production container contract: exact Node runtime, locked production deps, non-root user, minimal runtime copy and `/ready` healthcheck.
- [x] Dedicated container build/smoke workflow with read-only root filesystem and dropped capabilities.
- [ ] Live deployment acceptance on the chosen internal service runtime (Kairoseth read-only production acceptance workflow implemented; pending controlled production execution).
- [x] Static application-security review with CI regression guard.
- [ ] Live infrastructure security acceptance and focused external penetration test.

**Phase 6 internal engineering status:** complete for the agreed DeCA product scope. Remaining unchecked Phase 6 items are live/external acceptance executions or infrastructure/security evidence; the repository now exposes automation for the Kairoseth engine gate, WooCommerce live smoke, PrestaShop live smoke and backup/restore drill.

## Phase 7 — Transport Compliance Engine

- [ ] Generic Shipment aggregate.
  - [x] Versioned regulation-neutral Shipment contract.
  - [x] Structural Shipment validator with unique role-based parties.
  - [x] Canonical DeCA ↔ Shipment semantic round-trip adapter/tests.
  - [ ] Internal persistence migration from DeCA-shaped data to Shipment aggregate.
    - [x] Dual-write new/updated shipments to legacy DeCA `data` + internal generic `aggregate`.
    - [x] Keep internal `aggregate` out of public shipment API responses.
    - [x] Preserve existing idempotency semantics during the compatibility stage.
    - [ ] Backfill legacy Atlas shipment records without an `aggregate` (guarded inspect/apply tooling implemented; pending controlled Atlas execution and zero-missing evidence).
    - [x] Switch internal reads to Shipment-first with legacy-data fallback.
  - [x] DeCA document engine consumes Shipment through the adapter boundary.
- [ ] eCMR adapter.
  - [x] Authoritative baseline fixed to CMR Article 6 + e-CMR Protocol + UN/CEFACT eCMR D25A.
  - [x] Canonical internal eCMR projection contract.
  - [x] Shipment → eCMR adapter with explicit sender/contractual-carrier/consignee roles.
  - [x] CMR Article 6 mandatory-particular validation with legal-basis identifiers.
  - [x] Separate electronic authentication/integrity readiness validation.
  - [ ] UN/CEFACT D25A XML serialization + schema validation.
    - [x] Official UNECE D25A package identity, nested `XSD/Schema.zip` and root `uncefact/eCMR_100pD25A.xsd` pinned.
    - [x] Guarded local schema-bundle installer with archive/nested/root/full-tree SHA-256 manifest, per-schema inventory and path-traversal rejection.
    - [x] Offline fail-closed `xmllint --nonet` validation boundary.
    - [x] Reproducible generated-XML acceptance command with projection/XML/schema-tree/evidence hashes and independent evidence verification.
    - [x] Deterministic namespace-pinned XML envelope serializer for confirmed UN/CEFACT eCMR/MMT nodes.
    - [x] Core pickup/goods/package mappings: taking-over date, cargo nature, package count and shipping marks.
    - [x] Explicit package-type code mapping without deriving codes from free-text packing method.
    - [x] Structured carriage-charge mapping to `ApplicableLogisticsServiceCharge` with amount/currency validation.
    - [x] Structured dangerous-goods mapping to `ApplicableTransportDangerousGoods` with UNDG/proper-shipping-name fail-closed validation.
    - [x] Complete mapping for all current Article 6 projection fields: free-text packing method, customs/formalities and explicit CMR applicability clause included.
    - [ ] Full generated XML passes the installed official D25A XSD bundle with preserved hash evidence.
  - [ ] Cryptographic authentication/signature implementation.
    - [x] Identity-bound detached Ed25519 evidence over the exact XML SHA-256, verification-key fingerprint, signer metadata and signing instant.
    - [x] Fail-closed verification for content/key/identity/signature tampering.
    - [x] Verified-only projection binding with private-key material excluded from evidence/logging.
    - [x] Cryptographic verification kept distinct from legal authentication and amendment-history readiness.
    - [ ] Production signer identity policy, authorized-key registry/custody, revocation/rotation and jurisdiction-specific authentication acceptance.
  - [ ] Amendment/version lifecycle preserving original particulars.
    - [x] Immutable exact-XML version records with original-content, predecessor-content and predecessor-chain hash links.
    - [x] Deterministic chain verification detects content/metadata tampering, deletion/reordering and predecessor rewiring.
    - [x] No-op and non-monotonic-time amendments fail closed.
    - [x] Amendment-history readiness only binds when the latest preserved XML hash matches the current final-form content hash.
    - [x] Persist amendment versions immutably in MongoDB Atlas with organization/shipment scoping, current-head verification, unique lineage indexes and transactional audit.
    - [x] Authorized engine API read/append flow with `regulatory:read/write`, server-derived actor/time, exact-XML preservation and explicit expected-head conflict control.
    - [x] Atlas regulatory-head race automation prevents divergent accepted amendment heads.
    - [x] Kairoseth workspace human-authorization/identity UX.
    - [ ] Live concurrent-head execution against the intended Atlas environment.
    - [ ] Backup/restore and production smoke acceptance for amendment history (DR collection requirement implemented; live evidence still pending).
  - [ ] eCMR API/rendering/production issuance acceptance.
    - [x] Structured eCMR draft builder reuses Shipment facts while requiring explicit CMR parties/legal particulars.
    - [x] Regulatory-scoped structured preview returns projection/validation/D25A hash metadata without raw XML.
    - [x] Structured append regenerates D25A XML server-side and writes the immutable ledger without returning XML.
    - [x] Kairoseth structured customer review/preparation UX (no raw XML editor).
    - [x] Persisted human-review snapshot for structured versions, with canonical review hash and reserialization check against the immutable XML content hash.
    - [x] Verified human-readable eCMR review PDF with explicit NOT ISSUED / NOT SIGNED boundary and integrity checks before rendering.
    - [ ] Production signing and issuance UX after official D25A XSD acceptance and signer identity/key-custody policy.
- [ ] eFTI compatibility track.
- [ ] Additional transport-document modules.
