import { access } from "node:fs/promises";

const requiredPaths = [
  "README.md",
  "package.json",
  "apps/api/src/main.mjs",
  "apps/api/src/server.mjs",
  "packages/contracts/src/deca.mjs",
  "packages/core/src/validate-deca.mjs",
  "packages/document-engine/src/access-url.mjs",
  "packages/document-engine/src/snapshot.mjs",
  "packages/document-engine/src/pdf.mjs",
  "docs/architecture.md",
  "docs/legal-traceability.md",
  "docs/roadmap.md",
  "examples/deca-request.json"
];

for (const path of requiredPaths) {
  await access(path);
}

console.log(`Repository contract OK (${requiredPaths.length} required paths)`);
