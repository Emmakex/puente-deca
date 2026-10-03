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

### 4. Organization isolation

From two Kairoseth test organizations:

- create/list shipments;
- verify neither can retrieve the other's shipment/document;
- issue distinct connector credentials;
- verify credential revocation in one organization does not affect the other.

### 5. End-to-end DeCA

For a controlled shipment:

1. create shipment through Kairoseth;
2. generate DeCA;
3. verify immutable document version;
4. verify GridFS artifact metadata/size/SHA-256;
5. open the QR/public URL;
6. confirm direct PDF download without login/intermediate HTML;
7. compare downloaded PDF SHA-256 with document metadata.

### 6. Connector smoke

Run one WooCommerce and one PrestaShop controlled flow with organization-scoped connector keys.

### 7. Reconciliation

```bash
npm run artifacts:reconcile
```

Required before go-live:

```text
missingBeforeRetention = 0
orphanedArtifacts = 0
purgedArtifactsStillPresent = 0
```

### 8. Backup/restore

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
- edge/reverse-proxy abuse protection.
