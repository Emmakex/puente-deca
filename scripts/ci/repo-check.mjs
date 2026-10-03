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
  "connectors/file-import/src/import.mjs",
  "connectors/file-import/src/cli.mjs",
  "examples/file-import/shipments.csv",
  "packages/connector-contract-suite/src/contract.mjs",
  "connectors/reference/contract.mjs",
  "connectors/file-import/contract.mjs",
  "docs/architecture.md",
  "docs/openapi.json",
  "scripts/ci/openapi-check.mjs",
  "docs/legal-traceability.md",
  "docs/roadmap.md",
  "examples/deca-request.json"
];

for (const path of requiredPaths) {
  await access(path);
}

console.log(
  `Repository contract OK (${requiredPaths.length} required paths)`
);
