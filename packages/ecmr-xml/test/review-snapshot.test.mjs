import test from "node:test";
import assert from "node:assert/strict";

import {
  ecmrProjectionFromShipment
} from "../../core/src/ecmr-adapter.mjs";
import {
  createEcmrReviewSnapshot,
  verifyEcmrReviewSnapshot
} from "../src/review-snapshot.mjs";

const projection = () =>
  ecmrProjectionFromShipment({
    contractVersion:
      "2026-10",
    externalReference:
      "SHIP-REVIEW-1",
    transportMode: "road",
    parties: [
      {
        role: "sender",
        legalName:
          "Sender SL",
        address:
          "Madrid"
      },
      {
        role:
          "contractual_carrier",
        legalName:
          "Carrier SL",
        address:
          "Barcelona"
      },
      {
        role: "consignee",
        legalName:
          "Consignee SAS",
        address:
          "Lyon"
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
          "D25A"
      }
    ],
    extensions: {
      ecmr: {
        issue: {
          date:
            "2026-10-04",
          place:
            "Madrid"
        },
        takingOver: {
          date:
            "2026-10-05",
          place:
            "Madrid"
        },
        delivery: {
          place: "Lyon"
        },
        goods: {
          packingMethod:
            "Pallets",
          packingMethodCode:
            "PX",
          dangerousGoods: {
            declared: false
          },
          packages: {
            count: 8,
            marksAndNumbers: [
              "PAL-1"
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
          declared: true,
          statement:
            "This carriage is subject to the CMR Convention notwithstanding any clause to the contrary."
        }
      }
    }
  });

test(
  "creates a review snapshot cryptographically tied to the generated XML content",
  () => {
    const evidence =
      createEcmrReviewSnapshot(
        projection()
      );
    const result =
      verifyEcmrReviewSnapshot(
        evidence
      );

    assert.equal(
      result.valid,
      true
    );
    assert.equal(
      result.present,
      true
    );
    assert.match(
      evidence.reviewHash,
      /^sha256:[0-9a-f]{64}$/
    );
    assert.match(
      evidence.contentHash,
      /^sha256:[0-9a-f]{64}$/
    );
  }
);

test(
  "detects presentation tampering even if the immutable XML hash is left untouched",
  () => {
    const evidence =
      createEcmrReviewSnapshot(
        projection()
      );
    const tampered =
      structuredClone(
        evidence.reviewSnapshot
      );
    tampered.sender.legalName =
      "Tampered Sender SL";

    const result =
      verifyEcmrReviewSnapshot({
        reviewSnapshot:
          tampered,
        reviewHash:
          evidence.reviewHash,
        contentHash:
          evidence.contentHash
      });

    assert.equal(
      result.valid,
      false
    );
    assert.equal(
      result.code,
      "ECMR_REVIEW_HASH_MISMATCH"
    );
  }
);

test(
  "detects a self-consistent presentation that no longer reproduces the immutable XML",
  () => {
    const evidence =
      createEcmrReviewSnapshot(
        projection()
      );
    const changed =
      structuredClone(
        evidence.reviewSnapshot
      );
    changed.delivery.place =
      "Paris";
    const replacement =
      createEcmrReviewSnapshot(
        changed
      );

    const result =
      verifyEcmrReviewSnapshot({
        reviewSnapshot:
          replacement.reviewSnapshot,
        reviewHash:
          replacement.reviewHash,
        contentHash:
          evidence.contentHash
      });

    assert.equal(
      result.valid,
      false
    );
    assert.equal(
      result.code,
      "ECMR_REVIEW_CONTENT_HASH_MISMATCH"
    );
  }
);

test(
  "keeps legacy/raw versions valid when no review snapshot exists",
  () => {
    assert.deepEqual(
      verifyEcmrReviewSnapshot({
        reviewSnapshot: null,
        reviewHash: null,
        contentHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }),
      {
        valid: true,
        present: false,
        code: null
      }
    );
  }
);
