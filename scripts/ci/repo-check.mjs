import { access } from "node:fs/promises";

const requiredPaths = [
  "README.md",
  "package.json",
  "apps/api/src/main.mjs",
  "apps/api/src/server.mjs",
  "packages/contracts/src/deca.mjs",
  "packages/core/src/normalize-deca.mjs",
  "packages/core/src/validate-deca.mjs",
  "packages/document-engine/src/access-url.mjs",
  "packages/document-engine/src/snapshot.mjs",
  "packages/document-engine/src/qr.mjs",
  "packages/document-engine/src/pdf.mjs",
  "packages/persistence/src/json-store.mjs",
  "packages/persistence/src/store-factory.mjs",
  "connectors/file-import/src/csv.mjs",
  "connectors/file-import/src/xlsx.mjs",
  "connectors/file-import/src/import.mjs",
  "connectors/woocommerce/puente-deca-woocommerce.php",
  "connectors/woocommerce/includes/class-pdeca-woo-client.php",
  "connectors/woocommerce/includes/class-pdeca-woo-connector.php",
  "connectors/woocommerce/includes/class-pdeca-woo-order-payload.php",
  "connectors/woocommerce/includes/class-pdeca-woo-secret-store.php",
  "connectors/woocommerce/includes/class-pdeca-woo-settings.php",
  "connectors/prestashop/puentedeca.php",
  "connectors/prestashop/classes/PDECAPrestaShopClient.php",
  "connectors/prestashop/classes/PDECAPrestaShopConnector.php",
  "connectors/prestashop/classes/PDECAPrestaShopOrderPayload.php",
  "connectors/prestashop/classes/PDECAPrestaShopSecretStore.php",
  "scripts/ci/woocommerce-check.mjs",
  "scripts/ci/prestashop-check.mjs",
  "scripts/ci/connector-bootstrap-smoke.sh",
  "scripts/ci/release-package-check.mjs",
  "scripts/release/package-connectors.sh",
  "examples/deca-request.json",
  "examples/connectors/woocommerce.json",
  "examples/connectors/prestashop.json"
];

for (const path of requiredPaths) {
  await access(path);
}

console.log(`Product repository contract OK (${requiredPaths.length} required paths)`);
