import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocumentSnapshot,
  reviseDocumentSnapshot
} from "../src/snapshot.mjs";

const payload = () => ({
  externalReference: " SHIP-2026-0001 ",
  contractualShipper: {
    legalName: "Example Shipper SL",
    taxId: " b12345678 ",
    address: "Calle Ejemplo 1, Madrid"
  },
  effectiveCarrier: {
    legalName: "Example Carrier SL",
    taxId: "b87654321"
  },
  route: {
    origin: "Madrid",
    destination: "Barcelona"
  },
  goods: {
    nature: "Furniture",
    weight: {
      value: 420,
      unit: "kg"
    }
  },
  transport: {
    date: "2026-10-05",
    vehicle: {
      tractorRegistration: "1234 abc",
      trailerRegistration: null
    },
    specialTrafficAuthorization: null
  },
  observations: null
});

test("creates a canonical first document snapshot", () => {
  const snapshot = createDocumentSnapshot(payload(), {
    baseUrl: "https://deca.example.com",
    now: () => new Date("2026-10-03T05:00:00.000Z"),
    idFactory: () => "00000000-0000-4000-8000-000000000001",
    tokenFactory: () => "abcdefghijklmnop1234567890"
  });

  assert.equal(
    snapshot.documentId,
    "deca_00000000-0000-4000-8000-000000000001"
  );
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.createdAt, "2026-10-03T05:00:00.000Z");
  assert.equal(snapshot.modifiedAt, snapshot.createdAt);
  assert.equal(
    snapshot.accessUrl,
    "https://deca.example.com/d/abcdefghijklmnop1234567890.pdf"
  );
  assert.equal(snapshot.data.contractualShipper.taxId, "B12345678");
  assert.equal(snapshot.data.transport.vehicle.tractorRegistration, "1234ABC");
  assert.match(snapshot.contentHash, /^sha256:[a-f0-9]{64}$/);
});

test("content hash is stable for semantically identical normalized data", () => {
  const options = {
    baseUrl: "https://deca.example.com",
    now: () => new Date("2026-10-03T05:00:00.000Z"),
    idFactory: () => "00000000-0000-4000-8000-000000000001",
    tokenFactory: () => "abcdefghijklmnop1234567890"
  };

  const first = createDocumentSnapshot(payload(), options);
  const secondPayload = payload();
  secondPayload.contractualShipper.taxId = "B12345678";
  secondPayload.transport.vehicle.tractorRegistration = "1234ABC";
  secondPayload.externalReference = "SHIP-2026-0001";

  const second = createDocumentSnapshot(secondPayload, options);

  assert.equal(first.contentHash, second.contentHash);
});

test("revision increments the version and keeps original creation time", () => {
  const first = createDocumentSnapshot(payload(), {
    baseUrl: "https://deca.example.com",
    now: () => new Date("2026-10-03T05:00:00.000Z"),
    idFactory: () => "00000000-0000-4000-8000-000000000001",
    tokenFactory: () => "abcdefghijklmnop1234567890"
  });

  const revisedPayload = payload();
  revisedPayload.route.destination = "Sabadell";

  const revised = reviseDocumentSnapshot(first, revisedPayload, {
    baseUrl: "https://deca.example.com",
    now: () => new Date("2026-10-03T06:00:00.000Z"),
    idFactory: () => "00000000-0000-4000-8000-000000000002",
    tokenFactory: () => "ZYXWVUTSRQPONMLK0987654321"
  });

  assert.equal(revised.version, 2);
  assert.equal(revised.createdAt, first.createdAt);
  assert.equal(revised.modifiedAt, "2026-10-03T06:00:00.000Z");
  assert.equal(revised.previousVersionId, first.documentId);
  assert.notEqual(revised.documentId, first.documentId);
  assert.notEqual(revised.accessUrl, first.accessUrl);
  assert.notEqual(revised.contentHash, first.contentHash);
});

test("refuses to snapshot invalid DeCA data", () => {
  assert.throws(
    () =>
      createDocumentSnapshot({}, {
        baseUrl: "https://deca.example.com"
      }),
    (error) =>
      error.code === "DECA_VALIDATION_FAILED" &&
      error.validation.valid === false
  );
});
