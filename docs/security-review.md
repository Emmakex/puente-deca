# Static security review — 3 October 2026

## Result

The current Puente DeCA codebase has completed a static application-security review for the MVP architecture.

No critical static blocker was identified in the reviewed authentication, tenant-scoping, connector-secret, document-integrity, retention or production-configuration paths.

This is **not** a substitute for live infrastructure validation or an external penetration test.

## Reviewed controls

### Authentication and authorization

- Kairoseth Platform is authoritative for human users, organizations and product RBAC.
- Server-to-server requests require a high-entropy shared secret plus canonical organization context.
- The service secret is normalized through SHA-256 and compared with `timingSafeEqual`.
- Connector bearer credentials are organization scoped.
- Connector credentials cannot create/revoke other credentials.
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

### Tenant isolation

Operational reads/writes carry the canonical Kairoseth `organizationId`.

Shipments, connector credentials, document retrieval and audit operations are scoped by organization where applicable.

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

### HTTP response hardening

Engine responses now default to:

```text
Cache-Control: no-store
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

Stored PDF responses retain `private, no-store`.

### Request/abuse controls

- JSON request bodies are bounded to 1 MiB.
- Authenticated operational API traffic is rate limited per Kairoseth organization or connector credential.
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

## Remaining live security gates

These require the real production/staging infrastructure and are intentionally not marked complete by static review:

1. verify the Atlas service identity has least-privilege access;
2. verify network access rules/IP/private connectivity for Atlas;
3. execute transaction/index/GridFS smoke tests against the actual cluster;
4. execute backup + isolated restore drill;
5. validate Hostinger/CDN/WAF volumetric limits for the public QR route; Kairoseth application-level concurrency protection is already merged and covered by Production Smoke;
6. verify public QR route cannot leak engine/service headers;
7. run WooCommerce live-store smoke;
8. run PrestaShop 1.7.8 and current 8.x compatibility smoke;
9. execute cross-organization isolation tests through deployed Kairoseth;
10. perform a focused external penetration test before broad customer rollout.

## Residual product hardening

Production Unicode embedding is now implemented through an adaptive renderer: Latin-1 documents keep the lightweight native path, while extended text uses embedded Noto Sans/Fontsource script subsets. Characters outside the embedded font coverage still fail closed rather than being transliterated or corrupted.

The remaining release blockers are the live infrastructure/security gates above, not the PDF character-encoding path.
