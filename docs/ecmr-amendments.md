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

## Remaining production work

The cryptographic chain core is complete, but the lifecycle is not production-complete until:

- amendment versions are persisted immutably in MongoDB Atlas;
- APIs/workspace operations append versions rather than replacing history;
- authorization policy defines who may amend each eCMR;
- signatures/identity evidence for versions are retained as required;
- backup/restore acceptance includes the amendment collection;
- production concurrency tests prove two simultaneous amendments cannot create divergent accepted heads.

Until those gates are complete, the top-level roadmap item remains open.
