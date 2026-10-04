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

## Safety boundary

Both scripts are guarded in CI against shipment/document/order mutation methods.

They intentionally do not:

- create or update a Cargo shipment;
- generate a DeCA document;
- update order metadata;
- save connector sync state;
- change connector configuration.

A successful run proves runtime/bootstrap/credential/read connectivity and optional source-order mapping. It does not replace an operator-approved end-to-end order-to-DeCA acceptance when a dedicated test order/environment is available.
