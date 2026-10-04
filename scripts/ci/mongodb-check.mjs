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
  "deca_ecmr_signer_keys",
  "deca_shipments",
  "deca_document_versions",
  "deca_regulatory_versions",
  "deca_idempotency",
  "deca_audit_events"
]) {
  requirePattern(
    adapter,
    new RegExp(
      `collection\\s*\\(\\s*["']${collection}["']\\s*\\)`
    ),
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
  /kind: normalizedKind/,
  "MongoDB credentials must persist the commercial connector kind"
);
requirePattern(
  adapter,
  /kind: document\.kind \?\? "api"/,
  "MongoDB public credentials must preserve legacy api-kind compatibility"
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
  adapter,
  /regulatory_version_id_unique/,
  "Regulatory version IDs need a unique MongoDB index"
);
requirePattern(
  adapter,
  /regulatory_lineage_unique/,
  "Regulatory version lineage needs a unique MongoDB index"
);
requirePattern(
  adapter,
  /ecmr_signer_key_id_unique/,
  "eCMR signer-key IDs need a unique MongoDB index"
);
requirePattern(
  adapter,
  /ecmr_signer_org_fingerprint_unique/,
  "eCMR signer public-key fingerprints must be unique per organization"
);
for (const method of [
  "registerEcmrSignerKey",
  "listEcmrSignerKeys",
  "getEcmrSignerKey",
  "revokeEcmrSignerKey",
  "rotateEcmrSignerKey"
]) {
  requirePattern(
    adapter,
    new RegExp(method),
    `MongoDB store must persist the eCMR signer-key lifecycle method ${method}`
  );
}
requirePattern(
  adapter,
  /publicEcmrSignerKey/,
  "MongoDB signer-key API must strip stored public-key PEM from public records"
);
requirePattern(
  adapter,
  /assertRegulatoryVersionAppend/,
  "MongoDB regulatory writes must verify the current accepted head"
);
requirePattern(
  adapter,
  /REGULATORY_VERSION_CONFLICT/,
  "MongoDB regulatory writes must fail closed on concurrent lineage changes"
);
requirePattern(
  adapter,
  /aggregate:\s*document\.aggregate[\s\S]*clone\(document\.aggregate\)/,
  "MongoDB store must expose the internal Shipment aggregate to the engine"
);
requirePattern(
  adapter,
  /aggregate\s*=\s*undefined[\s\S]*requireRecord\([\s\S]*aggregate[\s\S]*"aggregate"/,
  "MongoDB shipment writes must validate the optional generic aggregate"
);
requirePattern(
  adapter,
  /aggregate:\s*clone\([\s\S]*normalizedAggregate/,
  "MongoDB shipment writes must persist the generic aggregate"
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
  "MongoDB persistence contract OK (Kairoseth-aligned collections, signer-key registry, indexes, transactions, generic Shipment dual-write, immutable regulatory ledger, production fail-closed)"
);
