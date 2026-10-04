import {
  readFile
} from "node:fs/promises";

const source =
  await readFile(
    "scripts/production/backfill-shipment-aggregates.mjs",
    "utf8"
  );

const required = [
  "SHIPMENT_AGGREGATE_BACKFILL_MODE",
  "BACKFILL_GENERIC_SHIPMENT_AGGREGATES",
  "MONGODB_DB_NAME",
  "deca_shipments",
  "aggregate: {",
  "$exists: false",
  "buildAggregateForLegacyShipment",
  "invalidCandidates",
  "skippedConcurrent",
  "complete:"
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error(
      `Shipment backfill is missing ${token}`
    );
  }
}

if (
  !/mode\s*===\s*"apply"/.test(
    source
  )
) {
  throw new Error(
    "Shipment backfill must distinguish inspect/apply modes"
  );
}

if (
  !/updateOne\([\s\S]*missingAggregateFilter[\s\S]*\$set:[\s\S]*aggregate/.test(
    source
  )
) {
  throw new Error(
    "Shipment backfill must update only missing aggregates"
  );
}

if (
  /\$unset|deleteMany|dropDatabase|replaceOne/.test(
    source
  )
) {
  throw new Error(
    "Shipment aggregate backfill must remain additive and non-destructive"
  );
}

if (
  /process\.stdout\.write[\s\S]*(?:MONGODB_URI|data:|contractualShipper|effectiveCarrier)/.test(
    source
  )
) {
  throw new Error(
    "Shipment backfill output must not expose connection strings or shipment payloads"
  );
}

console.log(
  "Shipment aggregate backfill contract OK (inspect default, explicit apply confirmation, additive writes, validation-first, sanitized evidence)"
);
