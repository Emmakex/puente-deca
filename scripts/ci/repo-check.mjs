import { access } from "node:fs/promises";

const requiredPaths = [
  "README.md",
  "package.json",
  "apps/api/src/main.mjs",
  "apps/api/src/server.mjs",
  "apps/api/test/operational-api.test.mjs",
  "packages/contracts/src/deca.mjs",
  "packages/core/src/canonical-json.mjs",
  "packages/core/src/validate-deca.mjs",
  "packages/document-engine/src/access-url.mjs",
  "packages/document-engine/src/snapshot.mjs",
  "packages/document-engine/src/qr.mjs",
  "packages/document-engine/src/pdf.mjs",
  "packages/persistence/src/json-store.mjs",
  "packages/persistence/src/file-artifact-store.mjs",
  "packages/persistence/test/api-credentials.test.mjs",
  "connectors/file-import/src/csv.mjs",
  "connectors/file-import/src/xlsx.mjs",
  "connectors/file-import/src/import.mjs",
  "connectors/file-import/src/cli.mjs",
  "connectors/file-import/test/xlsx.test.mjs",
  "examples/file-import/shipments.csv",
  "examples/file-import/shipments.xlsx",
  "packages/connector-contract-suite/src/contract.mjs",
  "connectors/reference/contract.mjs",
  "connectors/file-import/contract.mjs",
  "connectors/woocommerce/contract.mjs",
  "connectors/woocommerce/puente-deca-woocommerce.php",
  "connectors/woocommerce/includes/class-pdeca-woo-secret-store.php",
  "connectors/woocommerce/includes/class-pdeca-woo-settings.php",
  "connectors/woocommerce/includes/class-pdeca-woo-client.php",
  "connectors/woocommerce/includes/class-pdeca-woo-order-payload.php",
  "connectors/woocommerce/includes/class-pdeca-woo-connector.php",
  "scripts/ci/woocommerce-check.mjs",
  "scripts/production/connector-live-store-acceptance.mjs",
  "scripts/production/connector-live-evidence-verify.mjs",
  "test/connector-live-evidence-verify.test.mjs",
  "docs/connector-live-store-acceptance.md",
  "docs/architecture.md",
  "docs/kairoseth-platform-integration.md",
  "docs/openapi.json",
  "scripts/ci/openapi-check.mjs",
  "docs/legal-traceability.md",
  "docs/roadmap.md",
  "examples/deca-request.json",
  "examples/connectors/woocommerce.json"
];

for (const path of requiredPaths) {
  await access(path);
}

console.log(
  `Repository contract OK (${requiredPaths.length} required paths)`
);
