# Connector live-store acceptance

The remaining WooCommerce and PrestaShop connector gates require execution inside real store runtimes controlled by Kairoseth. The repository provides read-only smoke and completion-grade acceptance commands so this can be done without creating orders, shipments or DeCA documents.

Customer orders are not required for DeCA completion. Final acceptance must use a dedicated synthetic order in a Kairoseth-controlled acceptance store.

## Diagnostic smoke vs completion gate

There are two intentionally different modes:

1. **Diagnostic smoke** proves runtime/bootstrap/credential/read connectivity and can optionally map an existing order. It is useful during setup but is not sufficient for `deca-100`.
2. **Completion acceptance** additionally requires a synthetic Kairoseth-controlled order, complete DeCA mapping and an installed connector version that exactly matches the expected accepted release. Only this mode can emit `completionEligible: true`.

Both modes remain read-only.

## WooCommerce diagnostic smoke

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

Optional read-only mapping can still be exercised with `PDECA_WOO_SMOKE_ORDER_ID`, but diagnostic evidence does not become completion evidence merely because an order was supplied.

## WooCommerce completion acceptance

Use a dedicated synthetic order in the Kairoseth-controlled WooCommerce acceptance store:

```bash
PDECA_WP_ROOT=/absolute/path/to/wordpress \
PDECA_WOO_SMOKE_ORDER_ID=<synthetic-order-id> \
PDECA_ACCEPTANCE_DATA_CLASS=synthetic \
PDECA_ACCEPTANCE_ENVIRONMENT=kairoseth-controlled \
PDECA_EXPECTED_CONNECTOR_VERSION=<accepted-version> \
npm run production:woocommerce-live-acceptance
```

Acceptance fails closed unless:

- the store runtime and Cargo read check pass;
- the supplied order maps successfully;
- every mandatory DeCA source fact is present;
- the data class is explicitly `synthetic`;
- the environment class is explicitly `kairoseth-controlled`;
- the installed connector version exactly equals `PDECA_EXPECTED_CONNECTOR_VERSION`.

The evidence does not serialize the order ID, customer values, store filesystem root, connector secret or host environment.

## PrestaShop diagnostic smoke

Run on the PrestaShop host:

```bash
PDECA_PRESTASHOP_ROOT=/absolute/path/to/prestashop \
npm run production:prestashop-live-smoke
```

It verifies the live PrestaShop/module runtime, HTTPS connector configuration, encrypted credential and the same non-destructive Cargo read check. Optional mapping can be requested with `PDECA_PRESTASHOP_SMOKE_ORDER_ID`.

## PrestaShop completion acceptance

Run separately on the controlled 1.7.8.x and 8.x acceptance stores:

```bash
PDECA_PRESTASHOP_ROOT=/absolute/path/to/prestashop \
PDECA_PRESTASHOP_SMOKE_ORDER_ID=<synthetic-order-id> \
PDECA_ACCEPTANCE_DATA_CLASS=synthetic \
PDECA_ACCEPTANCE_ENVIRONMENT=kairoseth-controlled \
PDECA_EXPECTED_CONNECTOR_VERSION=<accepted-version> \
npm run production:prestashop-live-acceptance
```

Completion evidence is automatically classified from the actual runtime as exactly one of:

```text
prestashop-1.7.8.x
prestashop-8.x
```

Any other PrestaShop line is rejected for the completion gate. This prevents one acceptance result from being reused to satisfy both final PrestaShop rows.

## Sanitized retained evidence

The wrapper executes the guarded PHP smoke from an exact checkout of `Emmakex/puente-deca`, binds the result to `git rev-parse HEAD` and writes:

```text
.artifacts/connector-live/<connector>-acceptance-evidence.json
.artifacts/connector-live/<connector>-acceptance-evidence.json.sha256
```

Both files use owner-only permissions (`0600`). Schema version 2 contains:

- a unique `evidenceId`;
- repository and exact commit;
- UTC timestamp;
- connector and platform variant;
- `readOnly: true`;
- `completionGate` and `completionEligible` status;
- synthetic/Kairoseth-controlled declarations when in completion mode;
- expected connector version and sanitized runtime result;
- order mapping booleans and missing fact **names only**;
- no order ID or source field values.

The command output also surfaces the evidence SHA-256.

A normal diagnostic run may still write evidence, but it always has `completionEligible: false`. It must never be promoted to the final manifest.

## Verify and promote evidence into `deca-100`

Do not manually reinterpret a connector evidence file. Verify its checksum and completion semantics with:

```bash
npm run production:connector-live-evidence-verify -- \
  --evidence=.artifacts/connector-live/woocommerce-acceptance-evidence.json
```

or:

```bash
npm run production:connector-live-evidence-verify -- \
  --evidence=.artifacts/connector-live/prestashop-acceptance-evidence.json
```

The verifier reads the adjacent `.sha256` file by default. It rejects:

- checksum mismatch;
- diagnostic/non-completion evidence;
- non-synthetic or non-Kairoseth-controlled acceptance declarations;
- connector-version mismatch;
- incomplete order mapping;
- forged or inconsistent PrestaShop runtime classification.

A valid result emits exactly one final-manifest gate candidate:

```json
{
  "status": "ok",
  "check": "connector-live-evidence-verify",
  "gateName": "wooCommerceLive",
  "gate": {
    "status": "pass",
    "evidenceSha256": "sha256:<64 hex>",
    "repository": "Emmakex/puente-deca",
    "commit": "<40 hex>",
    "runId": "connector-live-<uuid>",
    "recordedAt": "<UTC timestamp>"
  }
}
```

Depending on the actual accepted runtime, `gateName` is exactly one of:

```text
wooCommerceLive
prestaShop178Live
prestaShop8Live
```

The nested `gate` object has the exact shape accepted by `scripts/production/final-infrastructure-acceptance.mjs`.

## Required mapping facts

When completion acceptance is requested, mapping is mandatory and must contain the configured DeCA source facts checked by the platform adapter, including shipper identity/address, carrier identity, origin/destination, goods nature and measure, transport date and tractor registration.

The wrapper rejects partial mappings with `ORDER_MAPPING_NOT_READY`.

## Safety boundary

Both PHP scripts are guarded in CI against shipment/document/order mutation methods. The evidence wrapper and verifier are guarded in CI so they must keep:

- read-only result validation;
- synthetic/Kairoseth-controlled completion declarations;
- mandatory completion-order mapping;
- expected connector-version binding;
- exact Git commit binding;
- SHA-256 evidence verification;
- owner-only artifact permissions;
- final-gate classification tied to the actual runtime line;
- no serialization of environment/order IDs/customer values.

They intentionally do not:

- create or update a Cargo shipment;
- generate a DeCA document;
- update order metadata;
- save connector sync state;
- change connector configuration.

A completion-grade success closes only the corresponding controlled live-store **read/mapping** acceptance row. It does not authorize use of customer data and does not create a production shipment.
