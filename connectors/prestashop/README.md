# Puente DeCA for PrestaShop

Thin native connector for **PrestaShop 1.7.8.x and 8.x**.

The module maps order facts and explicit logistics data into the canonical Puente DeCA shipment contract. DeCA validation, PDF/QR generation and document-version rules remain in Kairoseth Puente DeCA.

## Flow

```text
PrestaShop Order
  |
  | order facts + explicit transport data
  v
Puente DeCA module
  |
  | organization-scoped Bearer credential
  v
Kairoseth Puente DeCA API
  |
  +-- validate shipment
  +-- create/update Shipment
  +-- generate/reuse/revise DeCA
```

## Compatibility

Initial declared range:

- PrestaShop >= 1.7.8.0 and < 9.0;
- PHP 7.4+;
- cURL;
- libsodium or OpenSSL for encrypted API-key storage.

PrestaShop 9 is intentionally outside the initial range until a dedicated runtime acceptance matrix is completed.

## Configuration

Configuration is per shop:

- Puente DeCA HTTPS endpoint;
- connector API key created from the Kairoseth Puente DeCA workspace;
- contractual shipper legal name, tax ID and address;
- loading origin;
- optional default effective-carrier legal name and tax ID;
- optional comma-separated order-state IDs for automatic processing;
- request timeout.

The API key is encrypted at rest and is never displayed after saving.

Automation is **off by default** because the automatic-state list is empty on installation.

## Order transport data

The order view contains a local-only Puente DeCA status card. From there an operator opens the module controls for that order and can save:

- transport date;
- tractor registration;
- optional trailer registration;
- effective-carrier legal name and tax ID;
- optional shipment-weight override in kg;
- optional special traffic authorization.

The connector never guesses transport date, vehicle registration or legal carrier identity. If required data is missing, the central validator blocks generation.

## Weight

If there is no explicit weight override, the module sums native PrestaShop product weights and converts common configured units (kg, g, lb, oz) to kg. If any line has no usable weight or the configured unit is unknown, the connector does not fabricate a value.

## Idempotency and revisions

First processing uses:

```text
POST /v1/shipments
Idempotency-Key: prestashop:<shopId>:order:<orderId>:shipment:v1
POST /v1/shipments/:shipmentId/deca
```

Later processing reuses the stored shipment identity:

```text
PUT /v1/shipments/:shipmentId
POST /v1/shipments/:shipmentId/deca
```

If nothing material changed, the core reuses the current DeCA. If logistics changed, the core creates the next immutable linked version.

## Local persistence

Table: `pdeca_order_sync`, unique by shop + order.

It stores connector state and explicit logistics facts only: shipment/document IDs, status/error, transport date, registrations, carrier identity, optional weight override, optional special authorization and update timestamp.

The API key is not stored in this table.

## Hooks

- `displayAdminOrderMainBottom`: local-only status card in the order view.
- `actionOrderStatusPostUpdate`: optional processing for explicitly configured order-state IDs.

Rendering the order card performs no remote call. The post-status hook is a documented PrestaShop order-status hook; automation remains opt-in. 

## Security boundary

- endpoint must use HTTPS;
- connector key is organization-scoped and encrypted locally;
- the Kairoseth platform service secret is never installed in PrestaShop;
- connector keys cannot create other connector credentials;
- no public DeCA QR URL is copied into order messages;
- human auth, organizations and RBAC remain in Kairoseth Platform.

## Acceptance status

v0.1.0 includes deterministic connector-contract fixtures, static architecture/security gates and an executable PHP host-contract bootstrap matrix for PrestaShop 1.7.8.0 and 8.1.2. The matrix loads the real module/classes, exercises install/uninstall, hooks, encrypted credentials and representative order payload mapping.

This simulated host-contract matrix does not replace a real PrestaShop installation. Real 1.7.8.x and 8.x store acceptance remains a production-hardening gate before public release.

The live gate is automated and read-only. On an approved store host run:

```bash
PDECA_PRESTASHOP_ROOT=/absolute/path/to/prestashop npm run production:prestashop-live-smoke
```

An optional `PDECA_PRESTASHOP_SMOKE_ORDER_ID` maps an existing order in memory without writing connector sync state or creating a Cargo shipment.

## Connection check

After saving the Kairoseth Cargo endpoint and connector API key, use **Test Kairoseth Cargo connection** in the module configuration.

The check is non-destructive and calls `GET /v1/shipments?limit=1`. It verifies endpoint reachability, the organization-scoped credential, current commercial connector access and read permission without creating or modifying an order shipment.

