import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCsvObjects
} from "../src/csv.mjs";
import {
  importCsvText
} from "../src/import.mjs";

const headers = [
  "external_reference",
  "shipper_name",
  "shipper_tax_id",
  "shipper_address",
  "carrier_name",
  "carrier_tax_id",
  "origin",
  "destination",
  "goods_nature",
  "weight_value",
  "weight_unit",
  "alternative_measure_value",
  "alternative_measure_unit",
  "transport_date",
  "tractor_registration",
  "trailer_registration",
  "special_traffic_authorization",
  "observations"
].join(",");

test("parses quoted commas and escaped quotes", () => {
  const rows = parseCsvObjects(
    'a,b,c\n1,"two, values","say ""hello"""\n'
  );

  assert.equal(
    rows[0].values.b,
    "two, values"
  );
  assert.equal(
    rows[0].values.c,
    'say "hello"'
  );
});

test("maps and validates a valid CSV shipment", () => {
  const row = [
    "SHIP-CSV-001",
    "Example Shipper SL",
    "b12345678",
    '"Calle Ejemplo 1, Madrid"',
    "Example Carrier SL",
    "b87654321",
    "Madrid",
    "Barcelona",
    "Furniture",
    "420",
    "kg",
    "",
    "",
    "2026-10-05",
    '"1234 abc"',
    "",
    "",
    "Handle carefully"
  ].join(",");

  const result = importCsvText(
    `${headers}\n${row}\n`
  );

  assert.equal(result.total, 1);
  assert.equal(result.valid, 1);
  assert.equal(result.invalid, 0);
  assert.equal(
    result.records[0].request
      .contractualShipper.taxId,
    "B12345678"
  );
  assert.equal(
    result.records[0].request
      .transport.vehicle
      .tractorRegistration,
    "1234ABC"
  );
});

test("supports an alternative measure when weight is unavailable", () => {
  const row = [
    "SHIP-CSV-002",
    "Example Shipper SL",
    "B12345678",
    "Madrid",
    "Example Carrier SL",
    "B87654321",
    "Madrid",
    "Barcelona",
    "Palletized goods",
    "",
    "",
    "8",
    "pallets",
    "2026-10-05",
    "1234ABC",
    "",
    "",
    ""
  ].join(",");

  const result = importCsvText(
    `${headers}\n${row}\n`
  );

  assert.equal(result.valid, 1);
  assert.deepEqual(
    result.records[0].request.goods
      .alternativeMeasure,
    {
      value: 8,
      unit: "pallets"
    }
  );
});

test("keeps invalid rows with row-level errors", () => {
  const row = [
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "not-a-date",
    "",
    "",
    "",
    ""
  ].join(",");

  const result = importCsvText(
    `${headers}\n${row}\n`
  );

  assert.equal(result.valid, 0);
  assert.equal(result.invalid, 1);
  assert.equal(
    result.records[0].rowNumber,
    2
  );
  assert.ok(
    result.records[0].errors.length > 0
  );
});
