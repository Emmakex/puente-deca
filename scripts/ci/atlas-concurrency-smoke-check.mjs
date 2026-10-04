import { readFile } from "node:fs/promises";

const source = await readFile(
  "scripts/production/atlas-concurrency-smoke.mjs",
  "utf8"
);

const required = [
  "assertProductionEnvironment",
  "MongoStore.open",
  "Promise.allSettled",
  "IDEMPOTENCY_RETRY",
  "DOCUMENT_VERSION_EXISTS",
  "DOCUMENT_LINEAGE_CONFLICT",
  "idempotencyConcurrency",
  "documentVersionConcurrency",
  "cleanupVerified",
  "deleteMany",
  "countDocuments"
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error(
      `Atlas concurrency smoke is missing ${token}`
    );
  }
}

if (
  /process\.stdout\.write[\s\S]*(?:MONGODB_URI|KAIROSETH_SERVICE_SECRET)/.test(
    source
  )
) {
  throw new Error(
    "Atlas concurrency smoke must never print production secrets"
  );
}

if (
  /deleteMany\(\s*\{\s*\}\s*\)/.test(
    source
  )
) {
  throw new Error(
    "Atlas concurrency smoke cleanup must stay organization-scoped"
  );
}

console.log(
  "Atlas concurrency smoke contract OK (idempotency race, document-version race, convergence, scoped cleanup)"
);
