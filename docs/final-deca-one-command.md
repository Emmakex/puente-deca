# DeCA final acceptance — one-command close-out

This is the last repository-side orchestration step for the agreed DeCA scope.

It does **not** manufacture acceptance and it does not convert `READY` or `OPEN` evidence into `GREEN`. It may only be run after the eight canonical final gate results already exist and independently validate as `pass`.

## Command

```bash
node scripts/production/final-deca-acceptance.mjs \
  --gate-result=/secure/atlas-core.gate.json \
  --gate-result=/secure/dr-restore.gate.json \
  --gate-result=/secure/kairoseth-engine.gate.json \
  --gate-result=/secure/hostinger-edge.gate.json \
  --gate-result=/secure/infrastructure-security.gate.json \
  --gate-result=/secure/woocommerce-live.gate.json \
  --gate-result=/secure/prestashop-178-live.gate.json \
  --gate-result=/secure/prestashop-8-live.gate.json \
  --output-dir=/secure/deca-final
```

Exactly eight `--gate-result` arguments are required. `--output-dir` is optional and defaults to `.artifacts/deca-final`.

## What it performs

The orchestrator executes the close-out in this order:

1. reads exactly eight promoted gate result files;
2. sends them through the canonical `deca-100` composer/validator;
3. writes the validated infrastructure acceptance with mode `0600`;
4. creates deterministic WooCommerce and PrestaShop release ZIPs;
5. generates the CycloneDX SBOM;
6. creates and verifies the release manifest;
7. verifies `SHA256SUMS` against the connector ZIPs;
8. runs the canonical final DeCA evidence freeze from the exact Git `HEAD`;
9. validates the resulting freeze identity and writes a sanitized final summary.

The command fails closed if any child step fails. Child stdout/stderr is not replayed by the orchestrator, preventing accidental propagation of runtime/provider details into the final console result.

## Outputs

The selected output directory contains:

- `deca-final-infrastructure-evidence.json`
- `deca-final-release-evidence.json`
- `deca-final-acceptance-summary.json`

The final summary contains only the repository, exact commit, milestone, acceptance booleans, SHA-256 bindings and freeze timestamp.

Normal deterministic release artifacts continue to be written under `dist/` and remain subject to the existing release manifest and checksum verification.

## Fail-closed boundary

There is no `force`, `skip`, `bypass` or `allow-pending` mode.

The command cannot replace the still-required live/provider evidence for Atlas/GridFS, DR restore, the three live-store connector variants or infrastructure security. Those gates must first produce their own retained completion-grade evidence.

This flow is DeCA-only. eCMR/eFTI remain frozen until the DeCA ledger is fully green.
