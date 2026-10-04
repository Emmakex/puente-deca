# Puente DeCA production deployment runbook

This runbook deploys the Puente DeCA engine as the internal compliance service behind Kairoseth Platform.

## Canonical topology

```text
kairoseth.com
  |
  | Better Auth + organization + product RBAC
  v
Kairoseth Platform
  |
  | server-to-server
  v
Puente DeCA service
  |
  +-- MongoDB Atlas / kairoseth / deca_*
  +-- MongoDB Atlas GridFS / deca_pdf
```

Public QR documents are exposed only through:

```text
https://kairoseth.com/deca/d/<opaque-token>.pdf
```

## Required production environment

```text
NODE_ENV=production
PORT=8080
PUBLIC_BASE_URL=https://kairoseth.com/deca

MONGODB_URI=<Atlas service connection string>
MONGODB_DB_NAME=kairoseth
PERSISTENCE_DRIVER=mongodb

ARTIFACT_DRIVER=gridfs
DECA_GRIDFS_BUCKET=deca_pdf

ALLOW_JSON_STORE_IN_PRODUCTION=0
ALLOW_FILE_ARTIFACTS_IN_PRODUCTION=0

KAIROSETH_SERVICE_SECRET=<same high-entropy secret configured in Kairoseth>

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=600
RATE_LIMIT_MAX_ENTRIES=10000
```

The service secret must never be exposed to browser code, connector plugins or public QR routes.

## Preflight

Before starting the process:

```bash
npm run production:preflight
```

A failed preflight blocks deployment. It validates the canonical Kairoseth URL, Atlas/GridFS drivers, database/bucket names, disabled emergency overrides, server-to-server secret and rate-limit numeric configuration.

The preflight result never prints the MongoDB URI or service secret.

## Container image

Build:

```bash
docker build -t puente-deca:local .
```

The container uses Node 22.23.3, runs as the non-root `node` user and uses `/ready` for Docker health.

Recommended production runtime controls:

```text
read-only root filesystem
no-new-privileges
drop all Linux capabilities
init process
runtime-injected secrets only
```

See `docs/container-deployment.md`.

## Start

```bash
npm run server
```

The process opens one shared MongoDB client/pool for both metadata and GridFS.

## Pre-deployment contract gate

Before connecting production infrastructure, run:

```bash
npm run contract:kairoseth
```

This locally validates the canonical Kairoseth server-to-server flow, Unicode DeCA generation, public PDF path, checksum integrity, document reuse and cross-organization isolation.

## Atlas/GridFS live gate

With the intended staging/production-class Atlas environment configured:

```bash
npm run production:atlas-smoke
```

This must return `status=ok` before live deployment acceptance. It verifies real Atlas connectivity/index creation, transaction rollback and a GridFS upload/read/SHA-256/delete cycle without leaving test metadata.

## Acceptance sequence

### 1. Liveness

```bash
curl -fsS http://<internal-service>/health
```

Expected: HTTP 200 and `status=ok`.

### 2. Readiness

```bash
curl -fsS http://<internal-service>/ready
```

Expected: HTTP 200, metadata `ok`, artifacts `ok`.

Do not route Kairoseth production traffic to an instance that fails readiness.

### 3. Kairoseth protected health

Call Kairoseth's protected:

```text
/api/health/puente-deca
```

with the existing operations-health authorization. Expected: engine `ready`.

### 4. External Kairoseth → engine health smoke

```bash
OPERATIONS_HEALTH_SECRET='<configured secret>' \
npm run production:kairoseth-health-smoke
```

Expected: `status=ok` and `engine=ready`.

### 5. Kairoseth Cargo engine production acceptance

Run the private `kairoseth-platform` manual workflow:

```text
Kairoseth Cargo Engine Production Acceptance
```

That gate uses controlled existing production evidence and performs GET-only checks through `kairoseth.com`:

- protected Kairoseth → Puente DeCA health;
- organization-scoped Cargo connector/API read path;
- controlled shipment read;
- controlled direct public DeCA PDF;
- Kairoseth privacy/security headers;
- immutable PDF SHA-256.

It must not create or modify shipments/documents merely to prove deployment routing.

### 6. Organization isolation

From two Kairoseth test organizations:

- create/list shipments;
- verify neither can retrieve the other's shipment/document;
- issue distinct connector credentials;
- verify credential revocation in one organization does not affect the other.

### 7. End-to-end DeCA

For a controlled shipment:

1. create shipment through Kairoseth;
2. generate DeCA;
3. verify immutable document version;
4. verify GridFS artifact metadata/size/SHA-256;
5. open the QR/public URL;
6. confirm direct PDF download without login/intermediate HTML;
7. compare downloaded PDF SHA-256 with document metadata.

### 8. Public Kairoseth PDF smoke

Kairoseth also enforces a per-process in-flight public-PDF guard:

```text
PUENTE_DECA_PUBLIC_MAX_CONCURRENCY=16
```

Accepted range: `1..64`. Saturation returns HTTP `503` with `Retry-After: 1`.

The guard is intentionally concurrency-based rather than IP-based so transport/inspection users behind shared NAT/proxies are not coupled. It is defense-in-depth and does not replace Hostinger CDN/WAF volumetric protection.



Using an already-generated controlled DeCA and its immutable artifact SHA-256:

```bash
DECA_SMOKE_PUBLIC_URL='https://kairoseth.com/deca/d/<token>.pdf' \
DECA_SMOKE_EXPECTED_SHA256='sha256:<hash>' \
npm run production:public-pdf-smoke
```

Expected: `status=ok`, direct PDF, checksum match and all privacy headers green.

### 9. Connector smoke

Run one WooCommerce and one PrestaShop controlled flow with organization-scoped connector keys.

### 10. Reconciliation

```bash
npm run artifacts:reconcile
```

Required before go-live:

```text
missingBeforeRetention = 0
orphanedArtifacts = 0
purgedArtifactsStillPresent = 0
```

### 11. Backup/restore

Portable logical backup:

```bash
MONGODB_URI='<source Atlas URI>' \
MONGODB_DB_NAME=kairoseth \
npm run production:backup
```

Isolated DR restore:

```bash
RESTORE_MONGODB_URI='<DR Atlas URI>' \
RESTORE_DB_NAME='kairoseth_deca_dr_<id>' \
BACKUP_ARCHIVE='<archive>.archive.gz' \
BACKUP_EXPECTED_SHA256='sha256:<hash>' \
npm run production:restore-drill
```

The restore wrapper refuses the production database name `kairoseth` and verifies a restored GridFS PDF against its stored SHA-256.

See `docs/backup-restore-automation.md`.



Complete the staging/DR drill in `docs/backup-restore.md` and verify a restored PDF through its document metadata and SHA-256.

## Operations

- `/health`: process liveness only.
- `/ready`: MongoDB/GridFS operational readiness.
- `/metrics`: protected Prometheus-compatible process metrics.
- authenticated API limits: per Kairoseth organization / connector credential.
- retention purge: dry-run by default and explicit-confirmation only.

## Rollback

If readiness or E2E acceptance fails:

1. remove the new service instance from Kairoseth routing;
2. do not alter immutable DeCA metadata to make tests pass;
3. retain Atlas/GridFS state for diagnosis;
4. restore the previous known-good service release/configuration;
5. run reconciliation;
6. confirm existing QR PDFs remain downloadable before reopening traffic.

## Release candidate evidence

Before final go-live approval, generate and retain the exact release evidence:

```bash
npm run release:connectors
npm run release:sbom
npm run release:manifest
npm run release:verify
```

The resulting `dist/release-manifest.json` identifies the exact source commit, Node/package-manager versions and SHA-256 for the lockfile, OpenAPI contract, Dockerfile, connector packages and SBOM.

See `docs/release-candidate-evidence.md`.

## Automated core go-live command

With the production environment and a controlled existing DeCA document configured:

```bash
OPERATIONS_HEALTH_SECRET='<configured secret>' \
DECA_SMOKE_PUBLIC_URL='https://kairoseth.com/deca/d/<token>.pdf' \
DECA_SMOKE_EXPECTED_SHA256='sha256:<immutable hash>' \
npm run production:go-live
```

This runs preflight, Atlas/GridFS smoke, protected Kairoseth health, public PDF integrity and artifact reconciliation in a fixed order with no skip switches.

A green command still reports the manual/external release gates that remain outstanding.

See `docs/go-live-acceptance.md`.

## Go-live gate

Do not declare Puente DeCA production-ready until all are green:

- production preflight;
- liveness/readiness;
- Kairoseth protected health;
- organization isolation;
- native DeCA generation;
- QR direct PDF;
- Atlas/GridFS integrity;
- WooCommerce/PrestaShop smoke;
- reconciliation;
- backup/restore drill;
- security review;
- application-level public-PDF concurrency protection;
- Hostinger CDN/WAF edge-level abuse protection.
