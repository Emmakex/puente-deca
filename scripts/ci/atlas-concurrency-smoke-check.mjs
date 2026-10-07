import { readFile } from "node:fs/promises";

const source = await readFile(
  "scripts/production/atlas-concurrency-smoke.mjs",
  "utf8"
);

const required = [
  "assertProductionEnvironment",
  'topology: "in-process"',
  "MongoStore.open",
  "Promise.allSettled",
  "IDEMPOTENCY_RETRY",
  "DOCUMENT_VERSION_EXISTS",
  "DOCUMENT_LINEAGE_CONFLICT",
  "idempotencyConcurrency",
  "idempotencyConverged",
  "documentVersionConcurrency",
  "documentLineageConsistent",
  "cleanupVerified",
  "deca-only",
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

for (const forbidden of [
  "createEcmrAmendmentChain",
  "appendEcmrAmendment",
  "deca_regulatory_versions",
  "regulatoryType",
  "REGULATORY_VERSION_",
  "regulatoryVersionConcurrency",
  "regulatoryLineageConsistent"
]) {
  if (source.includes(forbidden)) {
    throw new Error(
      `DeCA Atlas concurrency smoke must not include frozen regulatory/eCMR scope: ${forbidden}`
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
  "Atlas concurrency smoke contract OK (in-process preflight, DeCA-only idempotency race, document-version race, convergence, scoped cleanup)"
);
