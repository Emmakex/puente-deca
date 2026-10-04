# Generic Shipment aggregate

Phase 7 introduces an internal regulation-neutral transport aggregate while preserving the existing DeCA customer API.

## Contract

The first version is:

```text
SHIPMENT_CONTRACT_VERSION=2026-10
```

The aggregate separates common transport concepts from regulatory documents:

```text
Shipment
├── externalReference
├── transportMode
├── parties[]              role-based, extensible
├── route
├── cargo
│   └── measures[]         weight / alternative_measure / future kinds
├── movement
│   ├── equipment
│   └── authorizations
├── notes
├── regulatoryContexts[]   DeCA today, future eCMR/eFTI adapters later
└── extensions
```

The structural validator is intentionally regulation-neutral. It validates the aggregate envelope, version, party-role uniqueness and container shapes. DeCA-specific legal requirements continue to be enforced by `validateDecaRequest`.

## DeCA adapter

`shipmentAggregateFromDeca()` maps the current canonical DeCA request into the generic aggregate.

`decaRequestFromShipmentAggregate()` maps the aggregate back into the existing DeCA request contract.

The adapter preserves the currently accepted canonical DeCA semantics, including:

- contractual shipper and effective carrier roles;
- route facts;
- weight and alternative measure as typed measures;
- vehicle/equipment facts;
- special traffic authorization;
- observations;
- existing extra request/nested fields used by integrations.

This means WooCommerce, PrestaShop, CSV/Excel and custom API clients do not need a contract migration merely because the internal domain root changes.

## Migration sequence

The migration is intentionally incremental:

1. **Done:** generic versioned Shipment contract.
2. **Done:** regulation-neutral structural validation.
3. **Done:** DeCA → Shipment → DeCA semantic round-trip tests.
4. **Done (compatibility stage):** new/changed DeCA shipments dual-write the generic Shipment aggregate alongside the current normalized DeCA `data`.
5. **Done:** public shipment responses explicitly strip the internal `aggregate`, so existing connector/API consumers keep the same contract.
6. **In progress:** guarded Atlas backfill tooling is implemented for shipment records that predate the aggregate field; production execution/evidence remains pending.
7. **Done:** internal DeCA document reads are Shipment-first; legacy `data` is used only when `aggregate` is absent.
8. **Done:** DeCA snapshot generation, revision and retention-date calculation consume the DeCA projection resolved through the Shipment adapter boundary.
9. **Next:** execute/preserve the controlled Atlas backfill evidence and remove the legacy fallback only after `missingAfter=0` is accepted.
10. **Later:** remove the DeCA-shaped persistence copy only after migration evidence proves no legacy record depends on it, then add eCMR/eFTI regulatory contexts without changing the tenant/auth/persistence boundary.

Backfill operation and evidence are documented in [`docs/shipment-backfill.md`](shipment-backfill.md).

During the compatibility stage, persisted `data` remains the public/legacy DeCA representation while `aggregate` is the new internal regulation-neutral representation. Idempotency remains fingerprinted from the existing DeCA request so the migration cannot turn an old retry into a new shipment merely because the internal aggregate field appeared.
