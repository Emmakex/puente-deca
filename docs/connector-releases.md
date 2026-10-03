# Connector release packaging

Puente DeCA builds WooCommerce and PrestaShop connectors as deterministic installation ZIPs.

## Build

```bash
npm run release:connectors
```

Output:

```text
dist/
  puente-deca-woocommerce-0.1.0.zip
  puentedeca-prestashop-0.1.0.zip
  SHA256SUMS
```

## Installation roots

WooCommerce:

```text
puente-deca-woocommerce/
  puente-deca-woocommerce.php
  includes/
```

PrestaShop:

```text
puentedeca/
  puentedeca.php
  classes/
```

The ZIPs intentionally exclude repository-only README and connector-contract files.

## Reproducibility

The packaging script:

- copies only runtime plugin/module files;
- normalizes all staged timestamps to 1 January 1980, the earliest portable ZIP timestamp;
- sorts file paths before compression;
- strips platform-specific ZIP extra fields with `zip -X`;
- emits SHA-256 checksums.

CI builds each package twice in separate temporary directories and requires byte-identical SHA-256 hashes.

## Release gate

Before publishing a connector release:

1. run `npm run check:release-packages`;
2. run `npm run release:connectors`;
3. verify `SHA256SUMS`;
4. install the WooCommerce ZIP on a controlled supported WooCommerce version;
5. install the PrestaShop ZIP on the supported compatibility matrix;
6. execute one end-to-end shipment/create/revise/DeCA download flow;
7. publish the exact ZIPs that passed the smoke tests.
