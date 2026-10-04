# Generic Shipment Atlas backfill

The generic Shipment migration uses an additive backfill for legacy `deca_shipments` documents created before the internal `aggregate` field existed.

The backfill never removes or rewrites the established DeCA `data` field.

## Inspect first

Default mode is read-only:

```bash
MONGODB_URI="..." \
MONGODB_DB_NAME=kairoseth \
npm run production:shipment-backfill
```

The command scans at most 1,000 missing records by default and reports:

- total records missing `aggregate` before the run;
- records inspected in this batch;
- valid migration candidates;
- invalid candidate count;
- records updated;
- concurrent skips;
- records still missing after the run;
- whether migration is complete.

Change the batch ceiling with:

```text
SHIPMENT_AGGREGATE_BACKFILL_LIMIT=1..10000
```

## Validation boundary

Before any write in an apply run, **every selected candidate is validated**:

1. existing `data` must still be a valid canonical DeCA request;
2. top-level `externalReference` must agree with the persisted DeCA request;
3. DeCA → generic Shipment conversion must succeed;
4. the generated aggregate must pass the regulation-neutral Shipment validator.

If one selected candidate fails, the batch performs **zero writes** and returns only its shipment ID plus a machine-readable error code. Customer/transport payloads are never printed.

## Apply

Writes require both apply mode and an explicit confirmation token:

```bash
SHIPMENT_AGGREGATE_BACKFILL_MODE=apply \
SHIPMENT_AGGREGATE_BACKFILL_CONFIRM=BACKFILL_GENERIC_SHIPMENT_AGGREGATES \
MONGODB_URI="..." \
MONGODB_DB_NAME=kairoseth \
npm run production:shipment-backfill
```

Each update is conditional on the record still lacking `aggregate`. If another application instance has already dual-written the aggregate, the backfill does not overwrite it and records a concurrent skip.

The update sets only:

```text
aggregate
```

It does not modify:

- `data`;
- `externalReference`;
- document lineage;
- timestamps;
- audit events;
- idempotency records;
- GridFS artifacts.

This is an internal representation migration, not an operational shipment change.

## Completion

Repeat inspect/apply batches until:

```json
{
  "missingAfter": 0,
  "complete": true
}
```

Only after that evidence is preserved should the engine switch internal reads to Shipment-first. Legacy-data fallback remains required until production backfill evidence is accepted.
