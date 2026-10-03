import test from "node:test";
import assert from "node:assert/strict";
import {
  runConnectorContract
} from "../src/contract.mjs";
import referenceConnector from "../../../connectors/reference/contract.mjs";
import fileImportConnector from "../../../connectors/file-import/contract.mjs";

const canonicalFixture = {
  externalReference:
    "REF-CONTRACT-001",
  contractualShipper: {
    legalName: "Example Shipper SL",
    taxId: "B12345678",
    address:
      "Calle Ejemplo 1, Madrid"
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
      tractorRegistration:
        "1234ABC",
      trailerRegistration: null
    },
    specialTrafficAuthorization:
      null
  },
  observations: null
};

test("reference connector satisfies the common contract", async () => {
  const result =
    await runConnectorContract({
      connector:
        referenceConnector,
      fixture:
        canonicalFixture
    });

  assert.equal(
    result.id,
    "reference"
  );
  assert.equal(
    result.normalized
      .externalReference,
    "REF-CONTRACT-001"
  );
});

test("file import connector satisfies the same contract", async () => {
  const source = {
    external_reference:
      "FILE-CONTRACT-001",
    shipper_name:
      "Example Shipper SL",
    shipper_tax_id:
      "B12345678",
    shipper_address:
      "Calle Ejemplo 1, Madrid",
    carrier_name:
      "Example Carrier SL",
    carrier_tax_id:
      "B87654321",
    origin: "Madrid",
    destination: "Barcelona",
    goods_nature: "Furniture",
    weight_value: "420",
    weight_unit: "kg",
    alternative_measure_value:
      "",
    alternative_measure_unit:
      "",
    transport_date:
      "2026-10-05",
    tractor_registration:
      "1234ABC",
    trailer_registration: "",
    special_traffic_authorization:
      "",
    observations: ""
  };

  const result =
    await runConnectorContract({
      connector:
        fileImportConnector,
      fixture: source
    });

  assert.equal(
    result.id,
    "file-import"
  );
  assert.equal(
    result.normalized
      .contractualShipper.taxId,
    "B12345678"
  );
});

test("contract suite rejects invalid connector output", async () => {
  const badConnector = {
    id: "bad",
    version: "1.0.0",
    capabilities: [
      "shipment.import"
    ],
    mapShipment() {
      return {};
    }
  };

  await assert.rejects(
    () =>
      runConnectorContract({
        connector: badConnector,
        fixture: {}
      }),
    (error) =>
      error.code ===
      "CONNECTOR_CONTRACT_INVALID_OUTPUT"
  );
});
