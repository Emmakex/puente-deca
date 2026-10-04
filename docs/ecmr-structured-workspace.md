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
6. creates a canonical human-review snapshot from the validated eCMR projection;
7. proves that reserializing that snapshot reproduces the exact immutable XML content hash;
8. appends the exact generated XML plus the review snapshot/hash evidence to the immutable regulatory ledger.

The response contains safe version metadata, head hashes, the structured preview and the human-review snapshot. The stored XML is stripped.

## Why preview and append regenerate independently

The serializer is deterministic. Preview does not create a mutable server-side draft object or token.

On confirmation, the same structured facts are submitted again and regenerated inside the engine. The resulting content hash provides a direct comparison with the preview hash.

This avoids:

- mutable draft persistence;
- browser-held XML;
- hidden server draft state;
- stale draft tokens;
- another persistence model before issuance is ready.

## Verifiable human-review snapshots

Structured versions persist two additional pieces of derived evidence:

```text
reviewSnapshot
reviewHash = SHA-256(canonical JSON(reviewSnapshot))
```

The review snapshot is not treated as independent truth.

Before history is returned, Puente DeCA:

1. verifies the immutable amendment chain;
2. validates the stored review projection;
3. verifies the canonical review hash;
4. serializes the review projection through the pinned D25A serializer;
5. requires the resulting XML SHA-256 to equal the immutable version `contentHash`.

If any of those checks fail, history fails closed with `ecmr_review_integrity_failure`.

Legacy/raw-XML versions remain readable with no review snapshot. A structured review is therefore available only where the engine can prove it corresponds to the preserved wire content.

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
- legacy Shipment fallback;
- Kairoseth structured customer form/review workflow with no raw XML;
- cryptographically cross-checked human-review snapshots for structured versions.

Still pending before production eCMR issuance:

- official D25A XSD PASS with preserved hash evidence;
- accepted signer/key-custody policy;
- live Atlas concurrency and DR evidence;
- final human-readable eCMR rendering/sign/issue flow.
