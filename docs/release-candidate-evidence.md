# Release candidate evidence

Puente DeCA release candidates produce a machine-verifiable evidence bundle.

## Build locally

```bash
npm ci
npm run release:connectors
npm run release:sbom
npm run release:manifest
npm run release:verify
```

Output:

```text
dist/
  puente-deca-woocommerce-0.1.0.zip
  puentedeca-prestashop-0.1.0.zip
  SHA256SUMS
  sbom.cdx.json
  release-manifest.json
```

## SBOM

`sbom.cdx.json` is generated from the committed npm dependency graph using CycloneDX.

For reproducibility:

- the random CycloneDX serial number is removed;
- the SBOM timestamp is normalized to the Git commit timestamp;
- the source commit SHA/date are recorded as Kairoseth properties.

## Release manifest

`release-manifest.json` identifies:

- product and product slug;
- package version;
- source repository + exact commit SHA;
- source commit date;
- exact Node version from `.nvmrc`;
- package manager version;
- canonical public document base;
- exact runtime dependencies;
- byte size + SHA-256 for:
  - `package.json`;
  - `package-lock.json`;
  - `.nvmrc`;
  - `Dockerfile`;
  - OpenAPI contract;
  - WooCommerce ZIP;
  - PrestaShop ZIP;
  - connector checksum manifest;
  - SBOM.

The manifest contains no credentials or runtime secrets.

## Verification

```bash
npm run release:verify
```

The verifier recalculates all listed file sizes/hashes and confirms the release identity, commit format, Node version and required artifacts.

## GitHub release-candidate workflow

The dedicated `release-candidate` workflow runs:

- manually;
- on `rc-v*` tags;
- when release-evidence machinery changes on `main`.

It executes normal checks/tests, the Kairoseth E2E contract, deterministic connector packaging, SBOM generation, manifest generation and verification.

The evidence bundle is retained as a GitHub Actions artifact for 90 days.

This workflow does not itself declare production acceptance. The live smokes and operational gates remain mandatory.
