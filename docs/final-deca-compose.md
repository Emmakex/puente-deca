# DeCA 100% final gate composition

The final `deca-100` infrastructure manifest must never be assembled by copying gate JSON by hand.

Use `scripts/production/final-infrastructure-evidence-compose.mjs` after the eight upstream evidence paths have independently passed and have been promoted by their canonical verifier/promoter.

## Inputs

Supply exactly eight `--gate-result=<path>` files. Each file must be the JSON output of the canonical producer for its gate:

- `atlasCore` → `final-gate-evidence-promote`
- `drRestore` → `final-gate-evidence-promote`
- `kairosethEngine` → `final-gate-evidence-promote`
- `hostingerEdge` → `final-gate-evidence-promote`
- `infrastructureSecurity` → `infrastructure-security-evidence-promote`
- `wooCommerceLive` → `connector-live-evidence-verify`
- `prestaShop178Live` → `connector-live-evidence-verify`
- `prestaShop8Live` → `connector-live-evidence-verify`

Example:

```bash
node scripts/production/final-infrastructure-evidence-compose.mjs \
  --gate-result=/secure/atlas-core.gate.json \
  --gate-result=/secure/dr-restore.gate.json \
  --gate-result=/secure/kairoseth-engine.gate.json \
  --gate-result=/secure/hostinger-edge.gate.json \
  --gate-result=/secure/infrastructure-security.gate.json \
  --gate-result=/secure/woocommerce-live.gate.json \
  --gate-result=/secure/prestashop-178-live.gate.json \
  --gate-result=/secure/prestashop-8-live.gate.json \
  --output=/secure/deca-final-infrastructure-manifest.json
```

The output file is written with mode `0600`.

## Fail-closed rules

The composer:

- requires exactly eight promoted results;
- rejects unknown or duplicate gate names;
- binds every gate to its expected producer;
- rejects extra fields in promoted result envelopes;
- sends the assembled manifest through the canonical `final-infrastructure-acceptance.mjs` validator;
- never converts `READY`, `OPEN` or malformed evidence into `pass`.

The resulting manifest is suitable for the final DeCA evidence freeze only after all eight upstream production/provider gates have produced retained, completion-grade evidence.

This flow is DeCA-only. eCMR/eFTI remain outside the final manifest until the DeCA milestone is closed.
