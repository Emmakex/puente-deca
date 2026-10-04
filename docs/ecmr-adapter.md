# eCMR adapter

Phase 7 introduces eCMR as a regulatory adapter over the generic Shipment aggregate. It is not a second shipment model.

## Authoritative baseline

The first adapter baseline uses:

- the CMR Convention, especially Article 6 mandatory consignment-note particulars;
- the Additional Protocol to CMR concerning the electronic consignment note, especially authentication/integrity requirements;
- UN/CEFACT eCMR message standard release D25A.

The internal contract records the UN/CEFACT release explicitly so later serializer/schema upgrades cannot silently change semantics.

## No legal-role guessing

The adapter does not infer:

- DeCA `contractual_shipper` → CMR sender;
- DeCA `effective_carrier` → CMR contractual carrier;
- any DeCA party → CMR consignee.

A Shipment intended for eCMR must carry explicit role-based parties:

```text
sender
contractual_carrier
consignee
```

Alternative role names can be selected explicitly through:

```text
extensions.ecmr.partyRoles
```

This prevents an integration convenience from becoming a legal assumption.

## eCMR-specific facts

The generic Shipment owns common transport facts such as cargo nature and quantity measures.

CMR-specific particulars that are not safely derivable from the current DeCA model live in:

```text
extensions.ecmr
```

including:

- issue date/place;
- taking-over date/place;
- delivery place;
- packing method;
- package count/marks/numbers;
- charges declaration/items;
- customs/formality declaration/instructions;
- explicit CMR applicability declaration.

The adapter intentionally does not default route origin/destination into legally distinct taking-over/delivery particulars.

## Two validation levels

### CMR particulars

`validateEcmrProjection()` verifies the canonical internal projection contains the mandatory Article 6 particulars used by this first vertical slice.

Errors include a stable `legalBasis` identifier such as:

```text
CMR_6_1_A
...
CMR_6_1_K
```

### Electronic readiness

`validateEcmrElectronicReadiness()` adds the electronic protocol gates:

- explicit authentication state/method/signature evidence;
- final integrity state;
- immutable content hash;
- preserved amendment history.

An Article-6-complete draft is therefore **not** automatically considered ready for electronic issuance.

## Current boundary

Implemented:

- canonical eCMR projection contract;
- UN/CEFACT release pinned to D25A;
- Shipment → eCMR mapping;
- Article-6 particulars validation;
- separate electronic-readiness validation;
- fail-closed/no-guessing tests;
- official D25A package identity/root XSD pinned;
- guarded local installer for the official UNECE XSD bundle with SHA-256 manifest;
- offline fail-closed `xmllint --nonet` schema-validation boundary;
- deterministic namespace-pinned XML envelope serializer for confirmed UN/CEFACT nodes.

Not yet implemented:

- complete D25A field mapping plus a passing official-XSD validation of a full eCMR document;
- cryptographic signature implementation;
- amendment/version event model;
- eCMR PDF/human-readable rendering;
- API endpoints;
- cross-border jurisdiction/party applicability decisioning;
- production issuance acceptance.

The current serializer explicitly reports schema conformance as pending until it has passed the official UNECE XSD bundle. See [`docs/ecmr-d25a-xml.md`](ecmr-d25a-xml.md).

Those remaining items stay explicit roadmap gates before Kairoseth can claim eCMR issuance.
