# MongoDB Atlas production persistence

Puente DeCA aligns with the existing Kairoseth Platform production data stack: **MongoDB Atlas**.

## Production boundary

Kairoseth Platform remains authoritative for:

- users and sessions;
- organizations and memberships;
- product RBAC;
- billing/entitlements.

Puente DeCA stores only product/service data in namespaced collections using the canonical Kairoseth `organizationId`.

## Collections

```text
deca_organizations
deca_api_credentials
deca_ecmr_signer_keys
deca_shipments
deca_document_versions
deca_regulatory_versions
deca_idempotency
deca_audit_events
deca_artifact_purges
```

`deca_organizations` is service metadata only. It does not replace the Kairoseth organizations collection and is never used to resolve human access.

## Runtime configuration

Development/tests:

```text
PERSISTENCE_DRIVER=json
STORE_PATH=.data/store.json
```

Production:

```text
NODE_ENV=production
PERSISTENCE_DRIVER=mongodb
MONGODB_URI=<Atlas connection string>
MONGODB_DB_NAME=kairoseth
```

If `MONGODB_URI` is present, MongoDB is selected automatically unless a driver is explicitly configured.

Production refuses to start with JSON persistence unless the emergency-only override `ALLOW_JSON_STORE_IN_PRODUCTION=1` is explicitly set.

## Client configuration

The connector follows the same MongoDB driver family and stable API posture as `kairoseth-platform`:

- `mongodb@7.5.0`;
- `ServerApiVersion.v1`;
- strict Stable API;
- deprecation errors;
- IPv4 preference;
- bounded connect/server-selection timeouts.

The Puente DeCA service should normally use a dedicated Atlas database user with access limited to the `deca_*` collections, even when it points at the same Atlas cluster/database as Kairoseth Platform.

## Indexes

The adapter creates idempotent indexes for:

- unique organization/service IDs;
- unique credential IDs and API-key hashes;
- unique eCMR signer-key IDs and organization + public-key fingerprints;
- eCMR signer-key history lookup by organization and creation time;
- shipment lookup by organization and update time;
- unique document ID;
- unique shipment + document version lineage;
- unique regulatory-version ID;
- unique organization + shipment + regulatory type + version lineage;
- regulatory history lookup by organization/shipment/type and creation time;
- unique public access path;
- retention-floor lookup by artifact retention date;
- unique idempotency scope;
- audit lookup by organization/shipment and time;
- unique artifact-purge evidence by document/storage key.

The live `production:atlas-smoke` command does not merely call `createIndex`. It reads the indexes back from Atlas and verifies the expected key order/direction and uniqueness contract for all 22 DeCA metadata indexes plus the GridFS filename index. Any drift fails closed.

## Atomicity

Operations that change more than one collection use MongoDB sessions and transactions. This includes:

- organization provisioning + audit;
- connector credential create/revoke + audit;
- eCMR signer-key register/revoke/rotation + audit;
- shipment create + idempotency + audit;
- shipment updates + audit;
- document version + shipment lineage + audit;
- regulatory-version append + current-head verification + audit.

The production Atlas deployment must therefore support transactions.

## Secrets

Connector API keys remain one-time-reveal secrets:

- plaintext is returned only at creation;
- only SHA-256 hashes are persisted;
- revocation preserves historical metadata;
- browser sessions never receive the Kairoseth server-to-server secret.

## Acceptance still required

Before declaring production readiness:

1. run `npm run production:atlas-smoke` against the real Atlas environment using the service database user;
2. preserve the resulting transaction/index/GridFS acceptance evidence;
3. run `npm run production:atlas-concurrency-smoke` and preserve its scoped-cleanup evidence;
4. verify backup/restore procedures;
5. run retention dry-run/purge/reconciliation acceptance;
6. validate GridFS backup and restore together with DeCA metadata.
