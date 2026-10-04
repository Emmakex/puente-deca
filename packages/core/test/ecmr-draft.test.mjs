import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEcmrDraftShipment,
  prepareEcmrDraft
} from "../src/ecmr-draft.mjs";

const baseShipment = () => ({
  contractVersion:
    "2026-10",
  externalReference:
    "SHIP-DRAFT-001",
  transportMode:
    "road",
  parties: [
    {
      role:
        "contractual_shipper",
      legalName:
        "DeCA Shipper SL",
      address:
        "Madrid"
    },
    {
      role:
        "effective_carrier",
      legalName:
        "DeCA Carrier SL",
      address:
        "Barcelona"
    }
  ],
  route: {
    origin: "Madrid",
    destination: "Lyon"
  },
  cargo: {
    nature:
      "Furniture",
    measures: [
      {
        kind: "weight",
        value: 420,
        unit: "kg"
      }
    ]
  },
  movement: {
    date:
      "2026-10-05",
    equipment: {},
    authorizations: {}
  },
  notes: null,
  regulatoryContexts: [
    {
      type: "deca",
      contractVersion:
        "2026-10"
    }
  ],
  extensions: {
    deca: {
      request: {}
    }
  }
});

const draftInput = () => ({
  sender: {
    legalName:
      "CMR Sender SL",
    address:
      "Madrid, ES"
  },
  contractualCarrier: {
    legalName:
      "CMR Carrier SL",
    address:
      "Barcelona, ES"
  },
  consignee: {
    legalName:
      "CMR Consignee SAS",
    address:
      "Lyon, FR"
  },
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
    packingMethodCode:
      "PX",
    packages: {
      count: 8,
      marksAndNumbers: [
        "PAL-1",
        "PAL-8"
      ]
    },
    dangerousGoods: {
      declared: false
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
    declared: true,
    statement:
      "This carriage is subject to the CMR Convention notwithstanding any clause to the contrary."
  }
});

test(
  "builds an eCMR draft on top of Shipment without guessing DeCA legal roles",
  () => {
    const base =
      baseShipment();
    const draft =
      buildEcmrDraftShipment({
        shipment:
          base,
        input:
          draftInput()
      });

    assert.deepEqual(
      base.parties.map(
        (party) =>
          party.role
      ),
      [
        "contractual_shipper",
        "effective_carrier"
      ]
    );

    assert.deepEqual(
      draft.parties.map(
        (party) =>
          party.role
      ),
      [
        "contractual_shipper",
        "effective_carrier",
        "sender",
        "contractual_carrier",
        "consignee"
      ]
    );

    assert.equal(
      draft.parties.find(
        (party) =>
          party.role ===
          "sender"
      ).legalName,
      "CMR Sender SL"
    );
    assert.notEqual(
      draft.parties.find(
        (party) =>
          party.role ===
          "sender"
      ).legalName,
      "DeCA Shipper SL"
    );
  }
);

test(
  "preserves non-eCMR Shipment facts and replaces only the eCMR extension/context",
  () => {
    const base =
      baseShipment();
    base.regulatoryContexts.push(
      {
        type: "custom",
        version: "1"
      }
    );
    base.extensions.custom = {
      keep: true
    };
    base.extensions.ecmr = {
      stale: true
    };
    base.parties.push(
      {
        role: "sender",
        legalName:
          "Stale Sender",
        address:
          "Old"
      }
    );

    const draft =
      buildEcmrDraftShipment({
        shipment:
          base,
        input:
          draftInput()
      });

    assert.deepEqual(
      draft.route,
      base.route
    );
    assert.deepEqual(
      draft.cargo,
      base.cargo
    );
    assert.equal(
      draft.extensions
        .custom.keep,
      true
    );
    assert.equal(
      draft.extensions
        .ecmr.stale,
      undefined
    );
    assert.equal(
      draft.regulatoryContexts
        .filter(
          (context) =>
            context.type ===
            "ecmr"
        ).length,
      1
    );
    assert.equal(
      draft.parties.filter(
        (party) =>
          party.role ===
          "sender"
      ).length,
      1
    );
  }
);

test(
  "prepares an Article-6-complete projection without mutating the base Shipment",
  () => {
    const base =
      baseShipment();
    const before =
      structuredClone(base);
    const prepared =
      prepareEcmrDraft({
        shipment: base,
        input:
          draftInput()
      });

    assert.equal(
      prepared.validation.valid,
      true
    );
    assert.equal(
      prepared.projection
        .externalReference,
      "SHIP-DRAFT-001"
    );
    assert.equal(
      prepared.projection
        .goods.quantity.value,
      420
    );
    assert.deepEqual(
      base,
      before
    );
  }
);

test(
  "returns legal-basis validation errors for incomplete explicit eCMR facts",
  () => {
    const input =
      draftInput();
    input.sender = {
      legalName: "",
      address: ""
    };
    input
      .conventionApplicability
      .statement = "";

    const prepared =
      prepareEcmrDraft({
        shipment:
          baseShipment(),
        input
      });

    assert.equal(
      prepared.validation.valid,
      false
    );
    assert.ok(
      prepared.validation
        .errors.some(
          (entry) =>
            entry.path ===
              "sender.legalName" &&
            entry.legalBasis ===
              "CMR_6_1_B"
        )
    );
    assert.ok(
      prepared.validation
        .errors.some(
          (entry) =>
            entry.path ===
              "conventionApplicability.statement" &&
            entry.legalBasis ===
              "CMR_6_1_K"
        )
    );
  }
);

test(
  "does not normalize lowercase currency into a valid charge currency",
  () => {
    const input =
      draftInput();
    input.charges.items = [
      {
        description:
          "Freight",
        amount: {
          value: 12.5,
          currency: "eur"
        }
      }
    ];

    const prepared =
      prepareEcmrDraft({
        shipment:
          baseShipment(),
        input
      });

    assert.equal(
      prepared.validation.valid,
      false
    );
    assert.ok(
      prepared.validation
        .errors.some(
          (entry) =>
            entry.path ===
            "charges.items.0.amount"
        )
    );
  }
);
