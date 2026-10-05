# Final DeCA infrastructure acceptance manifest

This manifest is the final evidence aggregator for the internally agreed **DeCA 100%** milestone.

It does **not** execute or replace any production gate. It is intentionally fail-closed and can only become valid after every required Kairoseth-owned acceptance has already produced retained evidence.

## Required gates

The manifest requires exactly these gates:

1. `atlasCore` — production Atlas transaction/index/concurrency/GridFS core acceptance;
2. `drRestore` — controlled backup → isolated restore/reconciliation drill;
3. `kairosethEngine` — deployed Kairoseth → Puente DeCA read-only engine acceptance;
4. `hostingerEdge` — safe Hostinger/CDN public DeCA edge acceptance;
5. `infrastructureSecurity` — Atlas/network/deployment/Hostinger infrastructure-security review;
6. `wooCommerceLive` — read-only WooCommerce live-store acceptance;
7. `prestaShop178Live` — read-only PrestaShop 1.7.8.x live-store acceptance;
8. `prestaShop8Live` — read-only PrestaShop 8.x live-store acceptance.

Every gate must have `status: "pass"` and a retained evidence SHA-256. A missing or pending gate makes the final manifest invalid.

## Secret-free schema

Each gate may contain only:

```json
{
  "status": "pass",
  "evidenceSha256": "sha256:<64 lowercase hex>",
  "repository": "Emmakex/example",
  "commit": "<git sha>",
  "runId": "<auditable run/evidence id>",
  "recordedAt": "2026-10-05T12:00:00Z"
}
```

Raw URLs, opaque PDF tokens, MongoDB URIs, API keys, service secrets and provider credentials are deliberately outside the schema and therefore rejected as extra fields.

## Example top-level manifest

```json
{
  "schemaVersion": 1,
  "milestone": "deca-100",
  "generatedAt": "2026-10-05T12:05:00Z",
  "gates": {
    "atlasCore": { "...": "..." },
    "drRestore": { "...": "..." },
    "kairosethEngine": { "...": "..." },
    "hostingerEdge": { "...": "..." },
    "infrastructureSecurity": { "...": "..." },
    "wooCommerceLive": { "...": "..." },
    "prestaShop178Live": { "...": "..." },
    "prestaShop8Live": { "...": "..." }
  }
}
```

## Validation

Run:

```bash
node scripts/production/final-infrastructure-acceptance.mjs \
  /secure/path/deca-final-infrastructure-manifest.json \
  /secure/path/deca-final-infrastructure-evidence.json
```

The optional output file is written with mode `0600` and contains only the validated, secret-free evidence summary.

The validator never marks a gate green on its own. DeCA can only be declared at the internally agreed 100% milestone after the eight upstream gates have separately passed and their retained evidence hashes are supplied.

This milestone is DeCA-only. eCMR and eFTI remain outside this acceptance manifest.
