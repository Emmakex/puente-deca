# Static and focused internal security review — 5 October 2026

## Result

The current Puente DeCA codebase has completed both the static application-security review for the MVP architecture and a focused internal negative security acceptance using synthetic fixtures.

No critical blocker was identified in the reviewed authentication, tenant-scoping, connector-secret, document-integrity, request-boundary, rate-limit, retention or production-configuration paths.

The focused internal acceptance is **not** a substitute for Kairoseth-owned infrastructure validation of Atlas, Hostinger/CDN/WAF, deployment routing and DR. Those infrastructure gates remain explicit below.

## Reviewed controls

### Authentication and authorization

- Kairoseth Platform is authoritative for human users, organizations and product RBAC.
- Server-to-server requests require a high-entropy shared secret plus canonical organization context.
- The service secret is normalized through SHA-256 and compared with `timingSafeEqual`.
- Connector bearer credentials are organization scoped.
- Connector credentials cannot create/revoke other credentials.
- Connector revocation takes effect immediately in the internal negative acceptance.
- Standalone lab endpoints are disabled on the production surface.

### Credential storage

Engine connector API keys:

- plaintext returned once on creation;
- SHA-256 hash stored in MongoDB;
- only prefix/scopes/status returned afterwards;
- revocation state preserved for audit.

WooCommerce and PrestaShop connector keys:

- sodium secretbox preferred;
- AES-256-GCM fallback;
- storage fails closed if neither secure primitive is available.

The controlled full-stack connector acceptance additionally verifies encrypted connector-secret roundtrips inside real ephemeral WooCommerce and PrestaShop runtimes.

### Tenant isolation

Operational reads/writes carry the canonical Kairoseth `organizationId`.

Shipments, connector credentials, document retrieval and audit operations are scoped by organization where applicable.

The focused internal acceptance verifies that an organization cannot retrieve another organization's shipment or private DeCA metadata and re-runs the canonical Kairoseth isolation E2E contract.

### Public PDF path

The public QR path:

- requires an opaque token;
- does not require customer login;
- returns PDF directly;
- enforces a 5,000,000-byte ceiling;
- verifies stored bytes against SHA-256 document metadata;
- does not receive the Kairoseth service secret.

Kairoseth owns the canonical public route:

```text
https://kairoseth.com/deca/d/<opaque-token>.pdf
```

The focused internal security acceptance verifies that the public token does not expose shipment/document IDs and that a modified token or traversal-style probe fails closed.

### HTTP response hardening

Engine responses now default to:

```text
Cache-Control: no-store
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

Stored PDF responses retain `private, no-store`.

The focused internal test checks these headers on successful public PDF responses and security/error responses.

### Request/abuse controls

- JSON request bodies are bounded to 1 MiB.
- Oversized JSON is rejected with HTTP 413 before shipment mutation.
- Authenticated operational API traffic is rate limited per Kairoseth organization or connector credential.
- The focused internal acceptance verifies HTTP 429 + `Retry-After` and independent organization buckets.
- Runtime rate-limit state is memory bounded.
- Kairoseth adds a bounded per-process public-PDF concurrency guard (default 16, maximum 64) that returns `503 + Retry-After` under saturation without using client-IP identity.
- Public QR volumetric/DDoS control beyond that application-level saturation guard remains an edge/CDN/WAF responsibility.

### Persistence and evidence

- production metadata: MongoDB Atlas;
- production PDF artifacts: GridFS;
- one shared MongoDB client per process;
- transactions for multi-record mutations;
- unique document lineage/access-path indexes;
- retention floor and explicit purge evidence;
- reconciliation for missing/orphaned artifacts;
- production refuses JSON/filesystem fallback.

### Dependencies and releases

Runtime dependencies are exact-version pinned and committed through `package-lock.json`.

CI uses cached `npm ci`.

WooCommerce and PrestaShop ZIPs are built deterministically and checked byte-for-byte in CI.

## Internal acceptance evidence

### Infrastructure-compatible integration

The controlled `DeCA Internal Acceptance` matrix exercises the existing Atlas-compatible transaction/index/GridFS and concurrency smokes against an isolated MongoDB replica set, and the exact packaged WooCommerce/PrestaShop release ZIPs against PHP 8.1, 8.2 and 8.3. The acceptance uses synthetic fixtures only and retains checksummed evidence.

### Connector full-stack

The controlled `DeCA Internal Full-Stack Connectors` matrix is green for:

- WordPress 6.5.5 + WooCommerce 8.2.2;
- WordPress 7.1.2 + WooCommerce 11.1.2;
- PrestaShop 1.7.8.11;
- PrestaShop 8.2.7.

Each case uses the exact packaged release artifact, synthetic data and an ephemeral real application/database runtime.

### Focused internal penetration/security acceptance

The `DeCA Internal Security Acceptance` gate is green for synthetic tests covering:

- platform authentication fail-closed behavior;
- invalid/missing organization and user context;
- production standalone-tool surface closure;
- connector privilege boundary;
- immediate connector credential revocation;
- tenant direct-object isolation;
- public DeCA token tampering/traversal probes;
- oversized request rejection;
- organization-scoped rate limiting;
- canonical Kairoseth E2E isolation.

The workflow retains sanitized logs, SHA-256 checksums and a structured acceptance-evidence record.

## Security CI guard

`npm run check:security` validates key invariants including:

- timing-safe service-secret comparison;
- no-store/nosniff/no-referrer defaults;
- 1 MiB body ceiling;
- production standalone-surface closure;
- hashed connector API keys;
- encrypted plugin/module secret storage;
- PDF SHA-256 and size guards;
- fail-closed production storage settings;
- exact dependency pins;
- empty secret placeholders in `.env.example`;
- obvious secret logging regressions.

## Remaining internal infrastructure security gates

These require the intended Kairoseth-owned production/staging infrastructure and are intentionally not marked complete by the isolated/full-stack/focused internal security tests:

1. verify the Atlas service identity has least-privilege access;
2. verify network access rules/IP/private connectivity for Atlas;
3. execute transaction/index/GridFS smokes against the intended Kairoseth-owned Atlas cluster;
4. execute backup + isolated restore drill against the controlled DR target;
5. validate Hostinger/CDN/WAF volumetric limits for the public QR route; Kairoseth application-level concurrency protection is already merged and covered by Production Smoke;
6. verify the deployed public QR route cannot leak engine/service headers at the Hostinger/Kairoseth edge;
7. execute cross-organization isolation tests through the deployed Kairoseth production-class route;
8. validate live deployment/readiness/rollback boundaries on the chosen Kairoseth-owned service runtime.

The focused internal penetration/security test itself is complete. An independent external audit can still be commissioned later for commercial or assurance purposes, but it is not a prerequisite for the internally agreed DeCA 100% milestone.

## Residual product hardening

Production Unicode embedding is implemented through an adaptive renderer: Latin-1 documents keep the lightweight native path, while extended text uses embedded Noto Sans/Fontsource script subsets. Characters outside the embedded font coverage fail closed rather than being transliterated or corrupted.

The remaining release blockers are Kairoseth-owned Atlas/Hostinger/DR/deployment infrastructure acceptance gates, not connector full-stack compatibility or the focused application-security path.
