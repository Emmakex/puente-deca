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
deca_shipments
deca_document_versions
deca_idempotency
deca_audit_events
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
- shipment lookup by organization and update time;
- unique document ID;
- unique shipment + document version lineage;
- unique public access path;
- unique idempotency scope;
- audit lookup by organization/shipment and time.

## Atomicity

Operations that change more than one collection use MongoDB sessions and transactions. This includes:

- organization provisioning + audit;
- connector credential create/revoke + audit;
- shipment create + idempotency + audit;
- shipment updates + audit;
- document version + shipment lineage + audit.

The production Atlas deployment must therefore support transactions.

## Secrets

Connector API keys remain one-time-reveal secrets:

- plaintext is returned only at creation;
- only SHA-256 hashes are persisted;
- revocation preserves historical metadata;
- browser sessions never receive the Kairoseth server-to-server secret.

## Acceptance still required

Before declaring production readiness:

1. run the adapter against the real Atlas environment;
2. verify index creation with the service database user;
3. run concurrent idempotency and document-version smoke tests;
4. verify backup/restore procedures;
5. confirm retention-aware deletion controls;
6. move PDF artifacts off local filesystem (GridFS or an approved object store).
