# Puente DeCA for WooCommerce

WordPress/WooCommerce connector for the Puente DeCA API.

The plugin deliberately keeps DeCA compliance rules in Puente DeCA. WooCommerce is only responsible for mapping order and logistics data into the canonical shipment contract, updating the same shipment when logistics change, and triggering document generation.

## Flow

```text
WC_Order
   |
map order + logistics metadata
   |
POST /v1/shipments (idempotent)
   |
PUT /v1/shipments/:id on later refreshes
   |
POST /v1/shipments/:id/deca
   |
order metadata: shipment ID + document ID + access URL
```

If the mapped shipment has not changed, Puente DeCA reuses the current DeCA. If logistics change, the plugin updates the existing shipment and the bridge creates a linked immutable DeCA revision.

## WooCommerce compatibility

- Uses WooCommerce CRUD APIs rather than direct order-table access.
- Declares High-Performance Order Storage (HPOS) compatibility.
- Uses Action Scheduler when available and falls back to WordPress cron.
- Requires WooCommerce 8.2+, WordPress 6.5+ and PHP 7.4+.

## Required configuration

In **WooCommerce > Puente DeCA** configure:

- Puente DeCA HTTPS endpoint.
- API key with shipment/document write scopes.
- contractual shipper legal name, tax identifier and address;
- loading origin;
- default carrier identity if it is not supplied per order;
- order-meta keys for transport date, tractor registration, optional trailer, optional special authorization and optional shipment weight;
- optional WooCommerce statuses that should trigger automatic processing.

Leaving all statuses unchecked enables manual-only mode. Orders can then use the WooCommerce order action **Generate / refresh DeCA**.

## Logistics data

The connector does not invent compliance data. Missing required transport date, carrier identity, tractor registration, destination or goods quantity/weight is allowed to reach the canonical validator and will fail closed.

Shipment weight can come from the configured order-meta field. If it is absent, the connector sums WooCommerce product weights and converts them to kilograms. If any line lacks a usable product weight, no synthetic weight is created and validation must be satisfied by the source system.

Optional values are sent as `null`, not empty strings, so they preserve the API's strict optional-field semantics.

## Security

The tenant API key is encrypted at rest with libsodium when available, otherwise AES-256-GCM through OpenSSL. There is no plaintext fallback.

The public document access URL returned by Puente DeCA is stored as order metadata, but it is not written into order notes. Order notes contain only the document ID.

## Extension point

The final canonical payload can be adapted before submission:

```php
add_filter(
    'pdeca_woo_shipment_payload',
    function ( $payload, $order, $settings ) {
        return $payload;
    },
    10,
    3
);
```

Any modified payload is still validated by Puente DeCA.

## Acceptance status

The connector now has an executable PHP host-contract smoke in CI. It loads the real plugin entrypoint/classes and verifies HPOS declaration, hook registration, encrypted secret roundtrip, the non-destructive Cargo connection request, representative `WC_Order` payload mapping and the manual order action.

This is a deterministic pre-release gate, not a claim that every WordPress/WooCommerce/plugin combination has been exercised. A live WooCommerce store smoke remains required before public connector release.

The live gate is automated and read-only. On an approved store host run:

```bash
PDECA_WP_ROOT=/absolute/path/to/wordpress npm run production:woocommerce-live-smoke
```

An optional `PDECA_WOO_SMOKE_ORDER_ID` maps an existing order in memory without saving it or creating a Cargo shipment.

## Connection check

After saving the Kairoseth Cargo endpoint and API key, use **Test Kairoseth Cargo connection** in the connector settings.

The check is non-destructive: it performs an authenticated `GET /v1/shipments?limit=1`. It therefore verifies endpoint reachability, the organization-scoped API key, connector lease/credential expiry and read scope without creating or changing a shipment.

