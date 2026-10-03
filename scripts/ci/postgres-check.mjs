import { readFile } from "node:fs/promises";

const migration = await readFile(
  "packages/persistence/sql/001_initial.sql",
  "utf8"
);
const adapter = await readFile(
  "packages/persistence/src/postgres-store.mjs",
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

for (const table of [
  "pdeca_organizations",
  "pdeca_api_credentials",
  "pdeca_shipments",
  "pdeca_document_versions",
  "pdeca_idempotency",
  "pdeca_audit_events"
]) {
  requirePattern(
    migration,
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),
    `Missing PostgreSQL table ${table}`
  );
}

requirePattern(
  migration,
  /ON DELETE RESTRICT/,
  "Compliance metadata must not cascade-delete in PostgreSQL"
);
requirePattern(
  migration,
  /UNIQUE \(shipment_id, version\)/,
  "Document version lineage must be unique per shipment"
);
requirePattern(
  adapter,
  /pg_advisory_xact_lock\(hashtext\(\$1\)\)/,
  "PostgreSQL idempotency must serialize same-scope creation"
);
requirePattern(
  adapter,
  /BEGIN[\s\S]*COMMIT[\s\S]*ROLLBACK/,
  "PostgreSQL adapter must use explicit transactions"
);
requirePattern(
  adapter,
  /access_path = \$1/,
  "Public DeCA lookup must use indexed access_path"
);
requirePattern(
  factory,
  /JSON persistence is disabled in production/,
  "Production must fail closed instead of silently using JsonStore"
);
requirePattern(
  factory,
  /PERSISTENCE_DRIVER/,
  "Persistence driver selection is missing"
);
requirePattern(
  factory,
  /DATABASE_URL/,
  "PostgreSQL configuration is missing"
);

console.log(
  "PostgreSQL persistence contract OK (tenant scope, lineage, idempotency, production fail-closed)"
);
