import test from "node:test";
import assert from "node:assert/strict";

import {
  publicShipmentResponse,
  publicShipmentListResponse
} from "../src/shipment-response.mjs";

test(
  "public shipment response keeps the legacy API shape and hides the internal aggregate",
  () => {
    const response =
      publicShipmentResponse({
        shipmentId: "shp_12345678",
        organizationId: "org_1",
        externalReference: "SHIP-1",
        data: {
          externalReference:
            "SHIP-1"
        },
        aggregate: {
          contractVersion:
            "2026-10",
          externalReference:
            "SHIP-1"
        },
        documentVersionIds: [],
        createdAt:
          "2026-10-04T00:00:00.000Z",
        updatedAt:
          "2026-10-04T00:00:00.000Z",
        changed: true,
        idempotentReplay: false
      });

    assert.equal(
      Object.hasOwn(
        response,
        "aggregate"
      ),
      false
    );
    assert.equal(
      response.externalReference,
      "SHIP-1"
    );
    assert.equal(
      response.changed,
      true
    );
    assert.equal(
      response.idempotentReplay,
      false
    );
  }
);

test(
  "public shipment list strips internal aggregates from every item",
  () => {
    const response =
      publicShipmentListResponse({
        items: [
          {
            shipmentId:
              "shp_12345678",
            aggregate: {
              contractVersion:
                "2026-10"
            }
          }
        ],
        total: 1
      });

    assert.equal(
      response.total,
      1
    );
    assert.equal(
      Object.hasOwn(
        response.items[0],
        "aggregate"
      ),
      false
    );
  }
);
