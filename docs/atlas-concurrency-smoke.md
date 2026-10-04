# Atlas concurrency live smoke

The production/staging concurrency gate is automated by:

```bash
npm run production:atlas-concurrency-smoke
```

Run it only with the same production-style environment validated by `npm run production:preflight`.

## What it verifies

The smoke uses one random organization namespace and the real MongoDB adapter.

### Shipment idempotency race

Two calls attempt to create the same shipment at the same time with the same organization-scoped idempotency key.

Acceptance requires:

- exactly one fresh shipment write;
- any concurrent loser to fail only with the explicit retry contract, or converge as an idempotent replay;
- a subsequent replay to resolve to the same canonical shipment;
- exactly one shipment row;
- exactly one idempotency row;
- exactly one `shipment.created` audit event.

### Document-version race

Two different document IDs attempt to create version 1 for the same shipment at the same time.

Acceptance requires:

- exactly one document version to win;
- the competing write to fail with the documented concurrency/lineage contract;
- exactly one persisted document version;
- exactly one `document.version.created` audit event;
- the shipment lineage to contain exactly the winning document ID.

## Data hygiene

All smoke records are scoped to a random organization ID beginning with:

```text
__pdeca_concurrency_
```

Cleanup deletes only records carrying that exact organization ID from the Puente DeCA namespaced collections.

Before reporting success, the command re-counts every service collection and requires zero residual records.

Cleanup is also attempted after a failed smoke.

No customer organization, shipment, credential or retained DeCA artifact is touched.

## Secret handling

The command never prints:

- `MONGODB_URI`;
- `KAIROSETH_SERVICE_SECRET`;
- database credentials.

## Expected success

```json
{
  "status": "ok",
  "check": "atlas-concurrency-smoke",
  "database": "kairoseth",
  "idempotencyConcurrency": true,
  "idempotencyConverged": true,
  "documentVersionConcurrency": true,
  "documentLineageConsistent": true,
  "cleanupVerified": true
}
```

A green result is live evidence for the concurrent idempotency/document-version persistence gate. It does not by itself authorize production launch.
