import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAggregateForLegacyShipment
} from "../src/shipment-migration.mjs";

const legacyShipment = () => ({
  shipmentId:
    "shp_legacy_001",
  externalReference:
    "SHIP-LEGACY-001",
  data: {
    externalReference:
      "SHIP-LEGACY-001",
    contractualShipper: {
      legalName:
        "Example Shipper SL",
      taxId:
        "B12345678",
      address:
        "Madrid"
    },
    effectiveCarrier: {
      legalName:
        "Example Carrier SL",
      taxId:
        "B87654321"
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
        trailerRegistration:
          null
      },
      specialTrafficAuthorization:
        null
    },
    observations: null
  }
});

test(
  "builds a valid generic aggregate for a legacy DeCA shipment",
  () => {
    const result =
      buildAggregateForLegacyShipment(
        legacyShipment()
      );

    assert.equal(
      result.aggregate
        .contractVersion,
      "2026-10"
    );
    assert.equal(
      result.aggregate
        .externalReference,
      "SHIP-LEGACY-001"
    );
    assert.equal(
      result.aggregate
        .regulatoryContexts[0]
        .type,
      "deca"
    );
  }
);

test(
  "rejects records whose persisted external reference disagrees with DeCA data",
  () => {
    const shipment =
      legacyShipment();
    shipment.externalReference =
      "DIFFERENT";

    assert.throws(
      () =>
        buildAggregateForLegacyShipment(
          shipment
        ),
      (error) =>
        error.code ===
        "SHIPMENT_MIGRATION_REFERENCE_MISMATCH"
    );
  }
);

test(
  "rejects invalid legacy DeCA payloads instead of fabricating an aggregate",
  () => {
    const shipment =
      legacyShipment();
    shipment.data.transport.date =
      "05/10/2026";

    assert.throws(
      () =>
        buildAggregateForLegacyShipment(
          shipment
        ),
      (error) =>
        error.code ===
          "SHIPMENT_MIGRATION_DECA_INVALID" &&
        Array.isArray(
          error.validationErrors
        )
    );
  }
);

test(
  "refuses to overwrite an existing aggregate",
  () => {
    const shipment =
      legacyShipment();
    shipment.aggregate = {
      contractVersion:
        "2026-10"
    };

    assert.throws(
      () =>
        buildAggregateForLegacyShipment(
          shipment
        ),
      (error) =>
        error.code ===
        "SHIPMENT_MIGRATION_ALREADY_COMPLETE"
    );
  }
);
