# PostgreSQL production persistence

Puente DeCA keeps the persistence contract independent from its storage backend.

## Drivers

Development and contract tests:

```text
PERSISTENCE_DRIVER=json
STORE_PATH=.data/store.json
```

Production:

```text
NODE_ENV=production
PERSISTENCE_DRIVER=postgres
DATABASE_URL=postgres://...
PGPOOL_MAX=10
PG_CONNECTION_TIMEOUT_MS=5000
PG_IDLE_TIMEOUT_MS=30000
```

When `NODE_ENV=production`, JSON persistence fails closed unless `ALLOW_JSON_STORE_IN_PRODUCTION=1` is explicitly set. That override is intended only for controlled emergency diagnostics and must not be part of the normal deployment configuration.

## Schema

Migration `001_initial.sql` creates relational tables for:

- organizations;
- connector API credentials;
- shipments;
- immutable DeCA document versions;
- organization-scoped idempotency;
- append-only audit events;
- schema migration state.

Compliance metadata uses `ON DELETE RESTRICT` instead of cascading deletion.

Document lineage is unique by `(shipment_id, version)`, while public document lookup uses a unique indexed `access_path`.

## Concurrency

The adapter uses PostgreSQL transactions for every multi-record mutation.

Shipment creation with an idempotency key takes a transaction-scoped advisory lock derived from the organization-scoped idempotency key before checking/inserting the record. This prevents two concurrent requests with the same key from creating separate shipments.

Updates lock the shipment row before comparing and replacing operational data.

## Credentials

Connector API keys remain one-time-reveal secrets:

- the plaintext API key is returned only at creation;
- only SHA-256 key hashes are stored;
- revoked credentials remain as audit/history metadata;
- credential rows are scoped to a Kairoseth organization.

## Migrations

The service runs the current idempotent SQL migration on PostgreSQL startup. Future schema changes must be added as new numbered migrations rather than editing an already-released migration.

Before first production release, the deployment acceptance gate must include a real PostgreSQL migration/smoke test and a backup/restore drill.

## Pooling

The service uses one `pg.Pool` per process. Normal single statements use the pool, while transactions acquire one client and keep all statements on that same client until commit/rollback.
