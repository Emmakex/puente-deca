# Connector PHP bootstrap acceptance

The connector release gates include an executable PHP host-contract smoke before real-store acceptance.

This is intentionally stronger than source regex checks or `php -l`, but it is not presented as a replacement for a real WooCommerce or PrestaShop installation.

## WooCommerce smoke

`scripts/ci/php/woocommerce-bootstrap-smoke.php` loads the real plugin entrypoint and connector classes inside a minimal WordPress/WooCommerce host contract.

It proves:

- plugin bootstrap completes without a PHP fatal error;
- HPOS compatibility is declared for `custom_order_tables`;
- settings, connection-test, asynchronous processing and manual order hooks register;
- automatic order processing remains opt-in;
- encrypted connector-key storage performs a real crypto roundtrip and never stores the test secret in plaintext;
- the non-destructive connection check calls `GET /v1/shipments?limit=1`, sends the Bearer credential and disables redirects;
- a representative `WC_Order` maps order facts, explicit logistics and product weight into the canonical shipment payload;
- the manual **Generate / refresh DeCA** order action remains available.

The simulated baseline is WordPress 6.5 / WooCommerce 8.2, matching the plugin minimums. A live WooCommerce store remains the final runtime acceptance gate.

## PrestaShop smoke matrix

`scripts/ci/php/prestashop-bootstrap-smoke.php` loads the real module entrypoint/classes against a minimal PrestaShop host contract.

CI executes it for:

- PrestaShop 1.7.8.0;
- PrestaShop 8.1.2.

For each target it proves:

- the target is inside the module's declared compatibility range;
- module construction and install lifecycle complete;
- the local `pdeca_order_sync` schema is created with `utf8mb4`;
- admin-order and order-status hooks register;
- automation remains off by default;
- the Kairoseth Cargo endpoint defaults to `https://kairoseth.com/api/deca`;
- encrypted connector-key storage performs a real crypto roundtrip without plaintext storage;
- a representative native Order/product/address shape maps into the canonical shipment payload;
- uninstall removes the local connector table.

This matrix validates the PHP/API contract used by the connector. It does **not** claim full runtime compatibility with every PrestaShop patch/theme/module combination. Real 1.7.8.x and 8.x store acceptance remains a release gate.

## Run locally

```bash
npm run check:connector-bootstrap
```

The command fails closed when PHP is unavailable rather than silently skipping the executable connector checks.

## Packaged ZIP acceptance

`npm run check:release-packages` now goes one step further than archive-layout and checksum validation:

1. it builds each connector ZIP twice and requires byte-for-byte reproducibility;
2. it verifies the allowed/required archive layout;
3. it extracts the first deterministic WooCommerce and PrestaShop ZIPs to an isolated temporary directory;
4. it reruns the same executable PHP bootstrap suite against the **extracted release entrypoints**, not the source-tree files.

This closes the packaging boundary: a release ZIP cannot pass merely because the repository source works while a required PHP class is absent, relocated or broken inside the deliverable.
