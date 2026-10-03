import test from "node:test";
import assert from "node:assert/strict";
import { validateDecaRequest } from "../src/validate-deca.mjs";

const validPayload = () => ({
  externalReference: "SHIP-2026-0001",
  contractualShipper: {
    legalName: "Example Shipper SL",
    taxId: "B12345678",
    address: "Calle Ejemplo 1, Madrid"
  },
  effectiveCarrier: {
    legalName: "Example Carrier SL",
    taxId: "B87654321"
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
      tractorRegistration: "1234ABC",
      trailerRegistration: null
    },
    specialTrafficAuthorization: null
  },
  observations: null
});

test("accepts a complete DeCA payload", () => {
  const result = validateDecaRequest(validPayload());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("assigns shipper responsibility to identity errors", () => {
  const payload = validPayload();
  payload.effectiveCarrier = {};

  const result = validateDecaRequest(payload);

  assert.equal(result.valid, false);
  assert.equal(
    result.errors.every(
      (item) => item.responsibleParty === "contractual_shipper"
    ),
    true
  );
});

test("accepts an alternative measure when exact weight is unavailable", () => {
  const payload = validPayload();
  delete payload.goods.weight;
  payload.goods.alternativeMeasure = {
    value: 8,
    unit: "pallets"
  };

  const result = validateDecaRequest(payload);
  assert.equal(result.valid, true);
});

test("assigns carrier responsibility to transport date and vehicle", () => {
  const payload = validPayload();
  payload.transport.date = "05/10/2026";
  payload.transport.vehicle.tractorRegistration = "";

  const result = validateDecaRequest(payload);

  assert.equal(result.valid, false);

  const dateError = result.errors.find(
    (item) => item.path === "transport.date"
  );
  const vehicleError = result.errors.find(
    (item) =>
      item.path === "transport.vehicle.tractorRegistration"
  );

  assert.equal(dateError.responsibleParty, "effective_carrier");
  assert.equal(vehicleError.responsibleParty, "effective_carrier");
});
