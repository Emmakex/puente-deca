import test from "node:test";
import assert from "node:assert/strict";

import {
  SHIPMENT_CONTRACT_VERSION,
  emptyShipmentAggregate
} from "../../contracts/src/shipment.mjs";
import {
  shipmentAggregateFromDeca,
  decaRequestFromShipmentAggregate
} from "../src/shipment-adapter.mjs";
import {
  validateShipmentAggregate
} from "../src/validate-shipment.mjs";
import {
  normalizeDecaRequest
} from "../src/normalize-deca.mjs";
import {
  validateDecaRequest
} from "../src/validate-deca.mjs";

const decaFixture = () =>
  normalizeDecaRequest({
    externalReference:
      " SHIP-GENERIC-1 ",
    contractualShipper: {
      legalName:
        "Example Shipper SL",
      taxId:
        "b12345678",
      address:
        "Madrid",
      internalCode:
        "SHIPPER-01"
    },
    effectiveCarrier: {
      legalName:
        "Example Carrier SL",
      taxId:
        "b87654321"
    },
    route: {
      origin:
        "Madrid",
      destination:
        "Barcelona",
      corridor:
        "A2"
    },
    goods: {
      nature:
        "Furniture",
      weight: {
        value: 420,
        unit: "kg"
      },
      alternativeMeasure: {
        value: 8,
        unit: "pallets"
      },
      temperatureControlled:
        false
    },
    transport: {
      date:
        "2026-10-05",
      vehicle: {
        tractorRegistration:
          "1234abc",
        trailerRegistration:
          "r1234bcd"
      },
      specialTrafficAuthorization:
        null,
      serviceLevel:
        "standard"
    },
    observations:
      "Handle with care",
    sourceTrace:
      "fixture-extra"
  });

test(
  "maps canonical DeCA data into a versioned generic shipment aggregate",
  () => {
    const deca =
      decaFixture();
    const shipment =
      shipmentAggregateFromDeca(
        deca
      );

    assert.equal(
      shipment.contractVersion,
      SHIPMENT_CONTRACT_VERSION
    );
    assert.equal(
      shipment.externalReference,
      "SHIP-GENERIC-1"
    );
    assert.equal(
      shipment.transportMode,
      "road"
    );
    assert.deepEqual(
      shipment.parties.map(
        ({ role }) => role
      ),
      [
        "contractual_shipper",
        "effective_carrier"
      ]
    );
    assert.deepEqual(
      shipment.cargo.measures.map(
        ({ kind }) => kind
      ),
      [
        "weight",
        "alternative_measure"
      ]
    );
    assert.deepEqual(
      shipment
        .regulatoryContexts,
      [
        {
          type: "deca",
          contractVersion:
            "2026-06"
        }
      ]
    );

    assert.equal(
      validateShipmentAggregate(
        shipment
      ).valid,
      true
    );
  }
);

test(
  "round-trips canonical DeCA semantics through the generic shipment aggregate",
  () => {
    const deca =
      decaFixture();
    const shipment =
      shipmentAggregateFromDeca(
        deca
      );
    const roundTrip =
      decaRequestFromShipmentAggregate(
        shipment
      );

    assert.deepEqual(
      roundTrip,
      deca
    );
    assert.equal(
      validateDecaRequest(
        roundTrip
      ).valid,
      true
    );
  }
);

test(
  "preserves DeCA request and nested extension fields during the adapter round-trip",
  () => {
    const deca =
      decaFixture();
    const shipment =
      shipmentAggregateFromDeca(
        deca
      );

    assert.equal(
      shipment.extensions
        .deca.request.sourceTrace,
      "fixture-extra"
    );
    assert.equal(
      shipment.parties[0]
        .internalCode,
      "SHIPPER-01"
    );
    assert.equal(
      shipment.route.corridor,
      "A2"
    );
    assert.equal(
      shipment.cargo
        .temperatureControlled,
      false
    );
    assert.equal(
      shipment.movement
        .serviceLevel,
      "standard"
    );

    assert.deepEqual(
      decaRequestFromShipmentAggregate(
        shipment
      ),
      deca
    );
  }
);

test(
  "generic shipment validation rejects duplicate party roles",
  () => {
    const shipment =
      emptyShipmentAggregate();

    shipment.externalReference =
      "SHIP-1";
    shipment.parties = [
      {
        role:
          "effective_carrier"
      },
      {
        role:
          "effective_carrier"
      }
    ];

    const result =
      validateShipmentAggregate(
        shipment
      );

    assert.equal(
      result.valid,
      false
    );
    assert.ok(
      result.errors.some(
        (entry) =>
          entry.code ===
            "duplicate" &&
          entry.path ===
            "parties.1.role"
      )
    );
  }
);

test(
  "generic shipment validation stays regulation-neutral",
  () => {
    const shipment =
      emptyShipmentAggregate();

    shipment.externalReference =
      "SHIP-FUTURE-1";
    shipment.transportMode =
      "road";
    shipment.parties = [
      {
        role: "carrier"
      }
    ];
    shipment.route = {};
    shipment.cargo = {};
    shipment.movement = {};
    shipment.regulatoryContexts = [
      {
        type: "future-document",
        contractVersion:
          "1"
      }
    ];

    const result =
      validateShipmentAggregate(
        shipment
      );

    assert.equal(
      result.valid,
      true
    );
  }
);
