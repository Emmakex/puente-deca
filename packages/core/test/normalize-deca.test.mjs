import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDecaRequest } from "../src/normalize-deca.mjs";

test("normalizes identifiers, registrations and surrounding whitespace", () => {
  const normalized = normalizeDecaRequest({
    externalReference: "  SHIP-1  ",
    contractualShipper: {
      legalName: "  Example SL ",
      taxId: " b12345678 ",
      address: "  Main street 1 "
    },
    effectiveCarrier: {
      legalName: " Carrier SL ",
      taxId: " esb87654321 "
    },
    route: {
      origin: " Madrid ",
      destination: " Barcelona "
    },
    goods: {
      nature: " Furniture ",
      weight: { value: 100, unit: " kg " }
    },
    transport: {
      date: " 2026-10-05 ",
      vehicle: {
        tractorRegistration: " 1234 abc ",
        trailerRegistration: " r 1234 bcd "
      }
    },
    observations: " fragile "
  });

  assert.equal(normalized.externalReference, "SHIP-1");
  assert.equal(normalized.contractualShipper.taxId, "B12345678");
  assert.equal(normalized.effectiveCarrier.taxId, "ESB87654321");
  assert.equal(normalized.transport.date, "2026-10-05");
  assert.equal(
    normalized.transport.vehicle.tractorRegistration,
    "1234ABC"
  );
  assert.equal(
    normalized.transport.vehicle.trailerRegistration,
    "R1234BCD"
  );
  assert.equal(normalized.observations, "fragile");
});
