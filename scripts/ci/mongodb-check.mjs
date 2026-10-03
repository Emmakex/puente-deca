import { readFile } from "node:fs/promises";

const adapter = await readFile(
  "packages/persistence/src/mongo-store.mjs",
  "utf8"
);
const factory = await readFile(
  "packages/persistence/src/store-factory.mjs",
  "utf8"
);

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

for (const collection of [
  "deca_organizations",
  "deca_api_credentials",
  "deca_shipments",
  "deca_document_versions",
  "deca_idempotency",
  "deca_audit_events"
]) {
  requirePattern(
    adapter,
    new RegExp(`collection\\("${collection}"\\)`),
    `Missing MongoDB collection ${collection}`
  );
}

requirePattern(
  adapter,
  /ServerApiVersion\.v1/,
  "MongoDB client must mirror the Kairoseth stable API configuration"
);
requirePattern(
  adapter,
  /withTransaction/,
  "Multi-record MongoDB mutations must use transactions"
);
requirePattern(
  adapter,
  /document_lineage_unique/,
  "Document lineage needs a unique MongoDB index"
);
requirePattern(
  adapter,
  /document_access_path_unique/,
  "Public access path needs a unique MongoDB index"
);
requirePattern(
  adapter,
  /idempotency_scope_unique/,
  "Idempotency scope needs a unique MongoDB index"
);
requirePattern(
  factory,
  /MONGODB_URI/,
  "MongoDB Atlas configuration is missing"
);
requirePattern(
  factory,
  /JSON persistence is disabled in production/,
  "Production must not silently fall back to JsonStore"
);

if (/postgres|DATABASE_URL|\bpg\b/i.test(adapter + factory)) {
  throw new Error(
    "Puente DeCA persistence must stay aligned with Kairoseth MongoDB Atlas"
  );
}

console.log(
  "MongoDB persistence contract OK (Kairoseth-aligned collections, indexes, transactions, production fail-closed)"
);
