# DeCA final-gate evidence promotion

This verifier/promoter converts retained, checksum-bound completion evidence into the exact gate object accepted by the final `deca-100` manifest.

It fills only the four remaining promotion gaps:

- `atlasCore`
- `drRestore`
- `kairosethEngine`
- `hostingerEdge`

The three connector live-store gates already come from `connector-live-evidence-verify.mjs`, and `infrastructureSecurity` already comes from `infrastructure-security-evidence-promote.mjs`. Those existing promoters remain authoritative.

## Usage

```bash
node scripts/production/final-gate-evidence-promote.mjs \
  --gate=atlasCore \
  --evidence=/secure/path/acceptance-evidence.json \
  --checksum=/secure/path/acceptance-evidence.json.sha256
```

`--checksum` may be omitted only when the adjacent `<evidence>.sha256` file exists.

Supported gate names are exactly `atlasCore`, `drRestore`, `kairosethEngine`, and `hostingerEdge`.

## Fail-closed checks

The promoter always verifies the retained SHA-256 before parsing the JSON and rejects known secret-bearing material. It then validates the canonical evidence shape for the selected gate.

For `atlasCore`, every preflight/GridFS/concurrency/reconciliation step and evidence flag must be green and all reconciliation anomaly counts must be zero.

For `drRestore`, the backup must have a non-empty archive plus hashes/namespaces, the isolated restore must verify at least one PDF and all metadata↔artifact links, reconciliation anomalies must be zero, and the DR database must be cleaned up rather than preserved.

For `kairosethEngine`, the protected Kairoseth artifact must be read-only, record zero production mutations, retain only hashed shipment/public-URL identifiers plus the PDF hash, and prove privacy headers and the engine bridge passed.

For `hostingerEdge`, the protected Kairoseth artifact must prove TLS, CDN observation, fail-closed CSP, immutable PDF integrity, eight-request bounded replay, rejected token/traversal probes, no forbidden-header leak, and explicitly no volumetric test. Freeze-grade edge evidence must also carry the protected workflow run ID and attempt.

## Output

A valid promotion emits:

```json
{
  "status": "ok",
  "check": "final-gate-evidence-promote",
  "gateName": "atlasCore",
  "gate": {
    "status": "pass",
    "evidenceSha256": "sha256:<exact retained evidence hash>",
    "repository": "Emmakex/puente-deca",
    "commit": "<source acceptance commit>",
    "runId": "<protected workflow run id>",
    "recordedAt": "<UTC timestamp>"
  }
}
```

Only the nested `gate` object belongs in the corresponding key of the final eight-gate manifest.

## Final eight-gate sources

The final manifest is intentionally assembled from verifier/promoter outputs, never from hand-authored pass objects:

- `atlasCore` → this promoter;
- `drRestore` → this promoter;
- `kairosethEngine` → this promoter;
- `hostingerEdge` → this promoter;
- `infrastructureSecurity` → `infrastructure-security-evidence-promote.mjs`;
- `wooCommerceLive` → `connector-live-evidence-verify.mjs`;
- `prestaShop178Live` → `connector-live-evidence-verify.mjs`;
- `prestaShop8Live` → `connector-live-evidence-verify.mjs`.

After all eight are available, validate the exact `deca-100` manifest with `final-infrastructure-acceptance.mjs`, then run `final-deca-evidence-freeze.mjs` against the matching release manifest and exact Puente DeCA Git HEAD.

This tooling does not turn a READY live gate into GREEN. The selected protected acceptance must have actually run and produced the retained bytes being promoted.
