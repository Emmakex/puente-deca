import test from "node:test";
import assert from "node:assert/strict";

import {
  ECMR_UNCEFACT_RELEASE
} from "../../contracts/src/ecmr.mjs";
import {
  ecmrProjectionFromShipment
} from "../src/ecmr-adapter.mjs";
import {
  validateEcmrProjection,
  validateEcmrElectronicReadiness
} from "../src/validate-ecmr.mjs";

const shipment = () => ({
  contractVersion:
    "2026-10",
  externalReference:
    "SHIP-ECMR-001",
  transportMode: "road",
  parties: [
    {
      role: "sender",
      legalName:
        "Sender SL",
      address:
        "Madrid, ES"
    },
    {
      role:
        "contractual_carrier",
      legalName:
        "Carrier SL",
      address:
        "Barcelona, ES"
    },
    {
      role: "consignee",
      legalName:
        "Consignee SAS",
      address:
        "Lyon, FR"
    }
  ],
  route: {
    origin: "Madrid",
    destination: "Lyon"
  },
  cargo: {
    nature: "Furniture",
    measures: [
      {
        kind: "weight",
        value: 420,
        unit: "kg"
      }
    ]
  },
  movement: {
    date: "2026-10-05",
    equipment: {},
    authorizations: {}
  },
  notes: null,
  regulatoryContexts: [
    {
      type: "ecmr",
      messageRelease:
        ECMR_UNCEFACT_RELEASE
    }
  ],
  extensions: {
    ecmr: {
      issue: {
        date: "2026-10-04",
        place: "Madrid"
      },
      takingOver: {
        date: "2026-10-05",
        place: "Madrid"
      },
      delivery: {
        place: "Lyon"
      },
      goods: {
        packingMethod:
          "Pallets",
        packages: {
          count: 8,
          marksAndNumbers: [
            "PAL-1",
            "PAL-8"
          ]
        }
      },
      charges: {
        declared: true,
        items: []
      },
      customsFormalities: {
        declared: true,
        instructions: []
      },
      conventionApplicability: {
        declared: true
      }
    }
  }
});

test(
  "projects a generic Shipment into an Article-6-complete eCMR draft",
  () => {
    const projection =
      ecmrProjectionFromShipment(
        shipment()
      );
    const result =
      validateEcmrProjection(
        projection
      );

    assert.equal(
      projection.messageRelease,
      "D25A"
    );
    assert.equal(
      projection.sender
        .legalName,
      "Sender SL"
    );
    assert.equal(
      projection
        .contractualCarrier
        .legalName,
      "Carrier SL"
    );
    assert.equal(
      projection.consignee
        .legalName,
      "Consignee SAS"
    );
    assert.deepEqual(
      projection.goods.quantity,
      {
        kind: "weight",
        value: 420,
        unit: "kg"
      }
    );
    assert.equal(
      result.valid,
      true
    );
  }
);

test(
  "does not guess eCMR legal parties from DeCA-only roles",
  () => {
    const current =
      shipment();
    current.parties = [
      {
        role:
          "contractual_shipper",
        legalName:
          "Shipper SL",
        address: "Madrid"
      },
      {
        role:
          "effective_carrier",
        legalName:
          "Effective Carrier SL",
        address: "Barcelona"
      }
    ];

    const projection =
      ecmrProjectionFromShipment(
        current
      );
    const result =
      validateEcmrProjection(
        projection
      );

    assert.equal(
      result.valid,
      false
    );
    assert.ok(
      result.errors.some(
        (entry) =>
          entry.path ===
          "sender.legalName"
      )
    );
    assert.ok(
      result.errors.some(
        (entry) =>
          entry.path ===
          "contractualCarrier.legalName"
      )
    );
    assert.ok(
      result.errors.some(
        (entry) =>
          entry.path ===
          "consignee.legalName"
      )
    );
  }
);

test(
  "requires explicit charges, customs and CMR declaration instead of inferring absence",
  () => {
    const current =
      shipment();

    current.extensions.ecmr
      .charges = {};
    current.extensions.ecmr
      .customsFormalities = {};
    current.extensions.ecmr
      .conventionApplicability = {};

    const result =
      validateEcmrProjection(
        ecmrProjectionFromShipment(
          current
        )
      );

    assert.equal(
      result.valid,
      false
    );

    for (const path of [
      "charges",
      "customsFormalities",
      "conventionApplicability"
    ]) {
      assert.ok(
        result.errors.some(
          (entry) =>
            entry.path === path
        )
      );
    }
  }
);

test(
  "Article-6 completeness does not falsely claim electronic issuance readiness",
  () => {
    const projection =
      ecmrProjectionFromShipment(
        shipment()
      );

    assert.equal(
      validateEcmrProjection(
        projection
      ).valid,
      true
    );

    const readiness =
      validateEcmrElectronicReadiness(
        projection
      );

    assert.equal(
      readiness.valid,
      false
    );
    assert.ok(
      readiness.errors.some(
        (entry) =>
          entry.legalBasis ===
          "ECMR_PROTOCOL_ARTICLE_3"
      )
    );
    assert.ok(
      readiness.errors.some(
        (entry) =>
          entry.legalBasis ===
          "ECMR_PROTOCOL_ARTICLE_4"
      )
    );
  }
);

test(
  "electronic readiness requires explicit authentication and integrity evidence",
  () => {
    const projection =
      ecmrProjectionFromShipment(
        shipment()
      );

    projection.authentication = {
      state: "authenticated",
      method:
        "reliable-electronic-signature",
      signatures: [
        {
          partyRole: "sender",
          signatureId:
            "sig_sender_1"
        }
      ]
    };
    projection.integrity = {
      state: "final",
      contentHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      amendmentHistoryPreserved:
        true
    };

    assert.equal(
      validateEcmrElectronicReadiness(
        projection
      ).valid,
      true
    );
  }
);
