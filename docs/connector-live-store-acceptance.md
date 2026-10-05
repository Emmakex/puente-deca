# Connector live-store acceptance

The remaining WooCommerce and PrestaShop connector gates require execution inside a real store runtime. The repository provides read-only smoke commands so this can be done without creating orders, shipments or DeCA documents.

## WooCommerce

Run on the WordPress/WooCommerce host:

```bash
PDECA_WP_ROOT=/absolute/path/to/wordpress \
npm run production:woocommerce-live-smoke
```

The smoke loads the real `wp-load.php`, then verifies:

- WordPress >= 6.5;
- WooCommerce >= 8.2;
- Kairoseth Cargo connector is active;
- connector settings use HTTPS;
- encrypted connector credential is configured;
- the connector can perform its existing non-destructive `GET /v1/shipments?limit=1` Cargo check.

To exercise mapping against an **existing** order without saving it or sending a shipment:

```bash
PDECA_WP_ROOT=/absolute/path/to/wordpress \
PDECA_WOO_SMOKE_ORDER_ID=1234 \
npm run production:woocommerce-live-smoke
```

The result reports only whether the payload mapped and which required fact names remain missing. It does not output customer/order field values.

## PrestaShop

Run on the PrestaShop host:

```bash
PDECA_PRESTASHOP_ROOT=/absolute/path/to/prestashop \
npm run production:prestashop-live-smoke
```

The smoke loads the real PrestaShop bootstrap and verifies:

- PrestaShop is inside the declared 1.7.8.x–8.x range;
- the `puentedeca` module is installed and active;
- connector settings use HTTPS;
- encrypted connector credential is configured;
- the connector can perform its existing non-destructive `GET /v1/shipments?limit=1` Cargo check.

Optional existing-order mapping:

```bash
PDECA_PRESTASHOP_ROOT=/absolute/path/to/prestashop \
PDECA_PRESTASHOP_SMOKE_ORDER_ID=1234 \
npm run production:prestashop-live-smoke
```

Again, the order is read only. No connector sync state is written and no shipment/document request is made.

## Audited acceptance evidence

For production acceptance, run the evidence wrapper from an exact checkout of the Puente DeCA repository on the same store host. The wrapper executes the guarded PHP smoke, binds the result to the current Git commit and writes a sanitized JSON evidence file plus SHA-256 sidecar.

WooCommerce without order mapping:

```bash
PDECA_WP_ROOT=/absolute/path/to/wordpress \
node scripts/production/connector-live-store-acceptance.mjs \
  --connector=woocommerce
```

WooCommerce with an existing read-only test order:

```bash
PDECA_WP_ROOT=/absolute/path/to/wordpress \
PDECA_WOO_SMOKE_ORDER_ID=1234 \
node scripts/production/connector-live-store-acceptance.mjs \
  --connector=woocommerce
```

PrestaShop without order mapping:

```bash
PDECA_PRESTASHOP_ROOT=/absolute/path/to/prestashop \
node scripts/production/connector-live-store-acceptance.mjs \
  --connector=prestashop
```

PrestaShop with an existing read-only test order:

```bash
PDECA_PRESTASHOP_ROOT=/absolute/path/to/prestashop \
PDECA_PRESTASHOP_SMOKE_ORDER_ID=1234 \
node scripts/production/connector-live-store-acceptance.mjs \
  --connector=prestashop
```

Evidence is written to:

```text
.artifacts/connector-live/<connector>-acceptance-evidence.json
.artifacts/connector-live/<connector>-acceptance-evidence.json.sha256
```

Both files are created with owner-only permissions (`0600`). The evidence contains the repository commit, timestamp, platform/connector versions, HTTPS/credential/read-connectivity status and the sanitized order-mapping summary. It never serializes the host environment or connector secret.

If an existing order ID is supplied, acceptance is fail-closed: the wrapper requires the order to map successfully and requires all mandatory DeCA facts to be present. A partial mapping therefore does not produce green acceptance evidence.

Retain the JSON evidence and checksum with the release/go-live evidence for the corresponding production acceptance. The file proves the connector runtime/read compatibility for that exact checkout and store. It does not turn the smoke into a shipment/document write test.

## Safety boundary

Both PHP scripts are guarded in CI against shipment/document/order mutation methods. The evidence wrapper is also guarded in CI so it must keep read-only result validation, exact Git commit binding, SHA-256 evidence and owner-only artifact permissions.

They intentionally do not:

- create or update a Cargo shipment;
- generate a DeCA document;
- update order metadata;
- save connector sync state;
- change connector configuration.

A successful run proves runtime/bootstrap/credential/read connectivity and optional source-order mapping. It does not replace an operator-approved end-to-end order-to-DeCA acceptance when a dedicated test order/environment is available.
