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
4. **Next:** store Shipment as the internal persistence aggregate while keeping DeCA API request/response compatibility.
5. **Then:** make DeCA document generation an adapter over Shipment.
6. **Later:** add eCMR/eFTI regulatory contexts without changing the tenant/auth/persistence boundary.

Until step 4 is complete, the current persisted shipment `data` remains the canonical normalized DeCA request. This avoids a schema migration before the generic model has deterministic coverage.
