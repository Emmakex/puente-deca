import test from "node:test";
import assert from "node:assert/strict";

import {
  shipmentAggregateFromDeca
} from "../src/shipment-adapter.mjs";
import {
  resolveDecaRequestFromShipment
} from "../src/shipment-deca-view.mjs";

const deca = () => ({
  externalReference:
    "SHIP-READ-1",
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
});

test(
  "uses the generic aggregate as the authoritative internal read when present",
  () => {
    const aggregate =
      shipmentAggregateFromDeca(
        deca()
      );

    const staleLegacy = {
      ...deca(),
      route: {
        origin: "Madrid",
        destination: "Valencia"
      }
    };

    const resolved =
      resolveDecaRequestFromShipment({
        externalReference:
          "SHIP-READ-1",
        aggregate,
        data:
          staleLegacy
      });

    assert.equal(
      resolved.source,
      "aggregate"
    );
    assert.equal(
      resolved.request
        .route.destination,
      "Barcelona"
    );
  }
);

test(
  "falls back to legacy DeCA data only when the aggregate is absent",
  () => {
    const resolved =
      resolveDecaRequestFromShipment({
        externalReference:
          "SHIP-READ-1",
        data: deca()
      });

    assert.equal(
      resolved.source,
      "legacy-data"
    );
    assert.equal(
      resolved.request
        .route.destination,
      "Barcelona"
    );
  }
);

test(
  "fails closed when an existing aggregate is corrupt instead of hiding it behind legacy data",
  () => {
    assert.throws(
      () =>
        resolveDecaRequestFromShipment({
          externalReference:
            "SHIP-READ-1",
          aggregate: {
            contractVersion:
              "bad"
          },
          data: deca()
        }),
      (error) =>
        error.code ===
        "SHIPMENT_AGGREGATE_INVALID"
    );
  }
);

test(
  "fails closed when aggregate-to-DeCA projection no longer satisfies DeCA rules",
  () => {
    const aggregate =
      shipmentAggregateFromDeca(
        deca()
      );

    aggregate.movement.date =
      "05/10/2026";

    assert.throws(
      () =>
        resolveDecaRequestFromShipment({
          externalReference:
            "SHIP-READ-1",
          aggregate,
          data: deca()
        }),
      (error) =>
        error.code ===
        "SHIPMENT_AGGREGATE_DECA_INVALID"
    );
  }
);

test(
  "rejects a resolved reference that disagrees with the persisted shipment identity",
  () => {
    assert.throws(
      () =>
        resolveDecaRequestFromShipment({
          externalReference:
            "SHIP-OTHER",
          data: deca()
        }),
      (error) =>
        error.code ===
        "SHIPMENT_VIEW_REFERENCE_MISMATCH"
    );
  }
);
