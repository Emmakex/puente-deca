import test from "node:test";
import assert from "node:assert/strict";
import {
  join
} from "node:path";
import {
  importXlsx,
  sheetRowsToObjects
} from "../src/xlsx.mjs";

test("maps generic sheet rows to the same file-import object contract", () => {
  const rows = sheetRowsToObjects([
    [
      "external_reference",
      "transport_date",
      "weight_value"
    ],
    [
      "SHIP-MATRIX-001",
      new Date("2026-10-05T00:00:00.000Z"),
      420
    ]
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].rowNumber, 2);
  assert.equal(
    rows[0].values.external_reference,
    "SHIP-MATRIX-001"
  );
  assert.ok(
    rows[0].values.transport_date
      instanceof Date
  );
  assert.equal(
    rows[0].values.weight_value,
    420
  );
});

test("imports a real XLSX workbook through the canonical validation core", async () => {
  const result = await importXlsx(
    join(
      process.cwd(),
      "examples/file-import/shipments.xlsx"
    )
  );

  assert.equal(result.total, 2);
  assert.equal(result.valid, 2);
  assert.equal(result.invalid, 0);

  assert.equal(
    result.records[0].request
      .externalReference,
    "SHIP-XLSX-001"
  );
  assert.equal(
    result.records[0].request
      .transport.date,
    "2026-10-05"
  );
  assert.equal(
    result.records[0].request
      .goods.weight.value,
    420
  );

  assert.equal(
    result.records[1].request
      .transport.date,
    "2026-10-06"
  );
  assert.deepEqual(
    result.records[1].request
      .goods.alternativeMeasure,
    {
      value: 8,
      unit: "pallets"
    }
  );
});

test("rejects duplicate XLSX headers", () => {
  assert.throws(
    () =>
      sheetRowsToObjects([
        ["origin", "origin"],
        ["Madrid", "Barcelona"]
      ]),
    /headers must be unique/
  );
});
