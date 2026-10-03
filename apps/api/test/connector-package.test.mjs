import assert from "node:assert/strict";
import test from "node:test";
import {
  createConnectorPackage,
  supportedConnectorPackage
} from "../src/connector-package.mjs";

test("connector package builder produces deterministic WooCommerce ZIP bytes", async () => {
  const first =
    await createConnectorPackage("woocommerce");
  const second =
    await createConnectorPackage("woocommerce");

  assert.equal(
    first.filename,
    "puente-deca-woocommerce-0.1.0.zip"
  );
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(
    first.bytes.readUInt32LE(0),
    0x04034b50
  );
  assert.ok(
    first.bytes.includes(
      Buffer.from(
        "puente-deca-woocommerce/puente-deca-woocommerce.php"
      )
    )
  );
});

test("connector package builder produces installable-root PrestaShop ZIP bytes", async () => {
  const artifact =
    await createConnectorPackage("prestashop");

  assert.equal(
    artifact.filename,
    "puentedeca-prestashop-0.1.0.zip"
  );
  assert.equal(
    artifact.bytes.readUInt32LE(0),
    0x04034b50
  );
  assert.ok(
    artifact.bytes.includes(
      Buffer.from(
        "puentedeca/puentedeca.php"
      )
    )
  );
  assert.ok(
    artifact.bytes.includes(
      Buffer.from(
        "puentedeca/classes/PDECAPrestaShopClient.php"
      )
    )
  );
});

test("connector package registry fails closed for unknown connectors", () => {
  assert.equal(
    supportedConnectorPackage("woocommerce"),
    true
  );
  assert.equal(
    supportedConnectorPackage("prestashop"),
    true
  );
  assert.equal(
    supportedConnectorPackage("magento"),
    false
  );
});
