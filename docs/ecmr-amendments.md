# eCMR immutable amendment history

The Additional Protocol requires subsequent changes to an electronic consignment note to be detectable while preserving the original particulars.

Puente DeCA now implements the cryptographic core of that requirement as an immutable version chain.

## Record format

Each preserved version contains:

```text
formatVersion
versionId
version
createdAt
actor
reason
xml
contentHash
originalContentHash
previousVersionId
previousContentHash
previousChainHash
chainHash
```

The complete exact XML string is preserved for every version. A hash alone is not treated as preservation of the original particulars.

## Hashes

`contentHash` is SHA-256 over the exact UTF-8 XML bytes.

`chainHash` is SHA-256 over canonical metadata containing:

- version identity/order;
- actor and reason;
- content hash;
- original-content hash;
- predecessor version/content/chain hashes;
- timestamp.

Therefore verification detects:

- XML changes;
- actor/reason changes;
- version deletion/reordering;
- predecessor rewiring;
- replacement of the original-content anchor;
- duplicate/invalid version IDs.

## Append rules

`appendEcmrAmendment()` first verifies the complete existing chain.

It then fails closed when:

- the new XML has the same content hash as the latest version;
- the new timestamp is not strictly later;
- the existing chain is already invalid.

It returns a new array and does not mutate the supplied chain.

## Final-form binding

A valid amendment chain alone is not enough to set Protocol Article 4 readiness.

`applyEcmrAmendmentChainEvidence()` additionally requires:

- the eCMR projection to already have `integrity.state=final`;
- its current `integrity.contentHash` to equal the chain's latest exact XML hash.

Only then does it set:

```text
integrity.amendmentHistoryPreserved = true
```

and record a compact chain summary in `integrity.amendmentChain`.

This prevents a valid historical chain for one document from being attached to a different signed final form.

## Persistence boundary

Both persistence drivers now expose the same append/list contract:

```text
appendEcmrAmendmentVersion()
listEcmrAmendmentVersions()
```

Production MongoDB uses the Kairoseth-aligned collection:

```text
deca_ecmr_amendment_versions
```

and unique indexes for:

- `versionId`;
- `organizationId + shipmentId + version`.

Every append runs inside a MongoDB transaction, verifies the complete persisted chain plus the candidate record, and writes an immutable audit event. Duplicate/concurrent next heads fail closed rather than silently branching.

The Atlas concurrency smoke now creates two simultaneous version-2 candidates from the same version-1 head and requires exactly one winner.

Backup already targets `deca_*`, and the DR restore gate now explicitly requires `deca_ecmr_amendment_versions`.

## Remaining production work

The cryptographic and persistence cores are implemented, but the lifecycle is not production-complete until:

- APIs/workspace operations append versions rather than replacing history;
- authorization policy defines who may amend each eCMR;
- signatures/identity evidence for versions are retained according to the selected production policy;
- the Atlas single-head concurrency smoke is executed against the intended staging/production-class environment;
- the backup/restore drill is executed and preserves the amendment collection.

Until those gates are complete, the top-level roadmap item remains open.
