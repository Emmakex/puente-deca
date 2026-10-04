import {
  readFile
} from "node:fs/promises";

const [
  server,
  resolver
] = await Promise.all([
  readFile(
    "apps/api/src/server.mjs",
    "utf8"
  ),
  readFile(
    "packages/core/src/shipment-deca-view.mjs",
    "utf8"
  )
]);

if (
  !server.includes(
    "resolveDecaRequestFromShipment"
  )
) {
  throw new Error(
    "Operational API must resolve DeCA data through the Shipment-first boundary"
  );
}

if (
  /shipment\.data/.test(
    server
  )
) {
  throw new Error(
    "Operational API must not read shipment.data directly after Shipment-first migration"
  );
}

for (const token of [
  'source = "aggregate"',
  'source = "legacy-data"',
  "validateShipmentAggregate",
  "decaRequestFromShipmentAggregate",
  "SHIPMENT_AGGREGATE_INVALID",
  "SHIPMENT_AGGREGATE_DECA_INVALID",
  "SHIPMENT_LEGACY_DATA_INVALID",
  "SHIPMENT_VIEW_REFERENCE_MISMATCH"
]) {
  if (!resolver.includes(token)) {
    throw new Error(
      `Shipment-first resolver is missing ${token}`
    );
  }
}

if (
  !/if \(hasAggregate\)[\s\S]*validateShipmentAggregate[\s\S]*else \{[\s\S]*source = "legacy-data"/.test(
    resolver
  )
) {
  throw new Error(
    "Legacy fallback must only run when aggregate is absent"
  );
}

console.log(
  "Shipment-first read contract OK (aggregate authoritative, legacy fallback only when absent, document engine isolated from shipment.data)"
);
