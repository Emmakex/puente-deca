# Final DeCA evidence freeze

The final freeze is the last mechanical gate before the agreed DeCA scope can be declared 100% accepted.

It does not create acceptance evidence. It only binds already-green evidence to the exact release commit.

## Preconditions

1. Build and verify the normal release candidate (`release:connectors`, SBOM, release manifest and checksum verification).
2. Complete all eight gates in `final-infrastructure-acceptance.mjs` and produce a validated `deca-100` evidence file.
3. Run the freeze from the exact Git commit recorded by the release manifest.

## Command

```bash
node scripts/production/final-deca-evidence-freeze.mjs \
  dist/release-manifest.json \
  /secure/path/deca-final-infrastructure-evidence.json \
  /secure/path/deca-final-release-evidence.json
```

The command fails closed unless:

- the release manifest is for `Emmakex/puente-deca` / `extensions/puente-deca`;
- its commit equals the current Git `HEAD`;
- WooCommerce and PrestaShop release ZIPs, `SHA256SUMS` and CycloneDX SBOM are present in the release manifest;
- the infrastructure evidence is the `deca-100` milestone;
- `allRequiredGatesPassed` is true;
- the exact official eight gates are present and every gate is `pass` with a valid SHA-256 evidence digest.

The resulting file contains only release/evidence hashes, commit, version and freeze timestamp, and is written with mode `0600`.

A successful freeze is the retained artifact used to close the ledger row **Final evidence freeze**. It cannot be generated as a substitute for missing Atlas, DR, Engine, Hostinger, infrastructure-security or connector-store evidence.

This process is DeCA-only. eCMR/eFTI remain frozen until the DeCA ledger is fully green.
