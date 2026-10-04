# Structured eCMR preparation flow

Kairoseth customers must not prepare eCMR by editing raw XML.

Puente DeCA therefore exposes a structured regulatory preparation boundary over the existing generic Shipment aggregate.

## Flow

```text
existing Shipment
  +
explicit eCMR facts
  ↓
temporary Shipment eCMR view
  ↓
Shipment → eCMR projection
  ↓
CMR Article 6 validation
  ↓
UN/CEFACT D25A serializer
  ↓
content SHA-256
```

The temporary eCMR view is not persisted into the Shipment during preview.

The immutable eCMR ledger remains the authoritative preserved-version history.

## Structured preview

```text
POST /v1/shipments/{shipmentId}/ecmr/preview
scope: regulatory:write
```

Input contains only structured eCMR-specific/legal facts:

- explicit sender;
- explicit contractual carrier;
- explicit consignee;
- issue date/place;
- taking-over date/place;
- delivery place;
- packing method and optional explicit package code;
- package count and marks;
- optional structured dangerous-goods facts;
- explicit charges declaration/items;
- explicit customs/formality declaration/instructions;
- explicit CMR applicability statement.

The engine reuses common Shipment facts such as:

- shipment external reference;
- cargo nature;
- weight/alternative quantity;
- existing non-eCMR Shipment context.

### No legal-role guessing

The draft builder does not map:

```text
DeCA contractual_shipper → CMR sender
DeCA effective_carrier   → CMR contractual carrier
```

The eCMR parties must be supplied explicitly.

## Preview response

A successful preview returns:

- structured eCMR projection;
- Article 6 validation result;
- D25A release/root-schema identity;
- current schema-conformance status;
- mapped/pending projection paths;
- SHA-256 of the exact generated XML.

It does **not** return the XML.

Invalid drafts return path/code/legal-basis validation evidence so Kairoseth can render field-level guidance without exposing wire-format details.

## Structured append

```text
POST /v1/shipments/{shipmentId}/ecmr/versions/structured
scope: regulatory:write
```

The request contains:

- `draft`;
- `reason`;
- `partyRole`;
- `expectedPreviousVersionId`.

The engine:

1. rebuilds and validates the draft;
2. serializes D25A XML internally;
3. checks the caller's expected accepted head;
4. derives actor identity from the authenticated credential/Kairoseth context;
5. uses the server-controlled amendment timestamp;
6. appends the exact generated XML to the immutable regulatory ledger.

The response contains safe version metadata, head hashes and the structured preview. The stored XML is stripped.

## Why preview and append regenerate independently

The serializer is deterministic. Preview does not create a mutable server-side draft object or token.

On confirmation, the same structured facts are submitted again and regenerated inside the engine. The resulting content hash provides a direct comparison with the preview hash.

This avoids:

- mutable draft persistence;
- browser-held XML;
- hidden server draft state;
- stale draft tokens;
- another persistence model before issuance is ready.

## Legacy Shipment compatibility

If a legacy shipment does not yet contain the generic `aggregate`, the engine builds a temporary aggregate from its validated canonical DeCA data for preview/structured append.

No backfill write is performed by these routes.

## Current product boundary

Implemented:

- structured draft builder;
- Article 6 preview;
- internal D25A generation;
- XML-free preview response;
- structured immutable append;
- optimistic head control;
- credential-derived actor;
- server timestamp;
- legacy Shipment fallback.

Still pending before production eCMR issuance:

- Kairoseth structured customer form/review workflow;
- official D25A XSD PASS with preserved hash evidence;
- accepted signer/key-custody policy;
- live Atlas concurrency and DR evidence;
- final human-readable eCMR rendering/sign/issue flow.
