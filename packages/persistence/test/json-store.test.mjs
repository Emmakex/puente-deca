import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../src/json-store.mjs";
import {
  createEcmrAmendmentChain,
  appendEcmrAmendment
} from "../../ecmr-amendment/src/amendment-chain.mjs";

const withStore = async (fn) => {
  const directory = await mkdtemp(
    join(tmpdir(), "puente-deca-store-")
  );
  const filePath = join(directory, "store.json");

  let counter = 0;
  const store = await JsonStore.open({
    filePath,
    now: () =>
      new Date(
        `2026-10-03T05:${String(counter).padStart(2, "0")}:00.000Z`
      ),
    idFactory: () => String(++counter).padStart(4, "0")
  });

  try {
    await fn({ store, filePath });
  } finally {
    await rm(directory, {
      recursive: true,
      force: true
    });
  }
};

const shipmentData = () => ({
  route: {
    origin: "Madrid",
    destination: "Barcelona"
  },
  goods: {
    nature: "Furniture"
  }
});

const snapshot = ({
  documentId = "deca_0001",
  version = 1,
  previousVersionId = null
} = {}) => ({
  documentType: "DECA",
  documentId,
  version,
  previousVersionId,
  createdAt: "2026-10-03T05:00:00.000Z",
  modifiedAt: "2026-10-03T05:00:00.000Z",
  accessUrl:
    `https://deca.example.com/d/${documentId}.pdf`,
  data: {}
});

test("persists organizations across store instances", async () => {
  await withStore(async ({ store, filePath }) => {
    const organization =
      await store.createOrganization({
        name: "Organization 001",
        externalReference: "tenant-001"
      });

    const reopened = await JsonStore.open({
      filePath
    });

    const loaded = await reopened.getOrganization(
      organization.organizationId
    );

    assert.equal(loaded.name, "Organization 001");
    assert.equal(
      loaded.externalReference,
      "tenant-001"
    );
  });
});

test("persists the internal generic shipment aggregate without requiring it for legacy callers", async () => {
  await withStore(async ({ store }) => {
    const organization =
      await store.createOrganization({
        name: "Organization 001"
      });

    const aggregate = {
      contractVersion: "2026-10",
      externalReference: "SHIP-AGG-1",
      transportMode: "road",
      parties: [],
      route: {},
      cargo: {},
      movement: {},
      notes: null,
      regulatoryContexts: [],
      extensions: {}
    };

    const shipment =
      await store.createShipment({
        organizationId:
          organization.organizationId,
        externalReference:
          "SHIP-AGG-1",
        data: shipmentData(),
        aggregate
      });

    assert.deepEqual(
      shipment.aggregate,
      aggregate
    );

    const loaded =
      await store.getShipment({
        organizationId:
          organization.organizationId,
        shipmentId:
          shipment.shipmentId
      });

    assert.deepEqual(
      loaded.aggregate,
      aggregate
    );

    const updatedAggregate = {
      ...aggregate,
      route: {
        destination: "Valencia"
      }
    };

    const updated =
      await store.updateShipment({
        organizationId:
          organization.organizationId,
        shipmentId:
          shipment.shipmentId,
        data: {
          ...shipmentData(),
          route: {
            origin: "Madrid",
            destination:
              "Valencia"
          }
        },
        aggregate:
          updatedAggregate
      });

    assert.equal(
      updated.changed,
      true
    );
    assert.deepEqual(
      updated.aggregate,
      updatedAggregate
    );

    const legacy =
      await store.createShipment({
        organizationId:
          organization.organizationId,
        externalReference:
          "SHIP-LEGACY-1",
        data: shipmentData()
      });

    assert.equal(
      Object.hasOwn(
        legacy,
        "aggregate"
      ),
      false
    );
  });
});

test("scopes shipments to their organization", async () => {
  await withStore(async ({ store }) => {
    const first = await store.createOrganization({
      name: "First"
    });
    const second = await store.createOrganization({
      name: "Second"
    });

    const shipment = await store.createShipment({
      organizationId: first.organizationId,
      externalReference: "SHIP-1",
      data: shipmentData()
    });

    assert.ok(
      await store.getShipment({
        organizationId: first.organizationId,
        shipmentId: shipment.shipmentId
      })
    );

    assert.equal(
      await store.getShipment({
        organizationId: second.organizationId,
        shipmentId: shipment.shipmentId
      }),
      null
    );
  });
});

test("counts document versions by organization and half-open time window", async () => {
  await withStore(async ({ store }) => {
    const first = await store.createOrganization({
      name: "First"
    });
    const second = await store.createOrganization({
      name: "Second"
    });

    const firstShipment = await store.createShipment({
      organizationId: first.organizationId,
      externalReference: "FIRST-1",
      data: shipmentData()
    });
    const secondShipment = await store.createShipment({
      organizationId: second.organizationId,
      externalReference: "SECOND-1",
      data: shipmentData()
    });

    await store.appendDocumentVersion({
      organizationId: first.organizationId,
      shipmentId: firstShipment.shipmentId,
      snapshot: snapshot({
        documentId: "deca_usage_first"
      })
    });
    await store.appendDocumentVersion({
      organizationId: second.organizationId,
      shipmentId: secondShipment.shipmentId,
      snapshot: snapshot({
        documentId: "deca_usage_second"
      })
    });

    assert.equal(
      await store.countDocumentVersions({
        organizationId: first.organizationId,
        from: new Date("2026-10-03T00:00:00.000Z"),
        to: new Date("2026-10-04T00:00:00.000Z")
      }),
      1
    );
    assert.equal(
      await store.countDocumentVersions({
        organizationId: first.organizationId,
        from: new Date("2026-10-04T00:00:00.000Z"),
        to: new Date("2026-10-05T00:00:00.000Z")
      }),
      0
    );
  });
});

test("replays identical idempotent shipment creates and rejects conflicts", async () => {
  await withStore(async ({ store }) => {
    const organization =
      await store.createOrganization({
        name: "Organization 001"
      });

    const first = await store.createShipment({
      organizationId: organization.organizationId,
      externalReference: "SHIP-1",
      data: shipmentData(),
      idempotencyKey: "source-order-100"
    });

    const replay = await store.createShipment({
      organizationId: organization.organizationId,
      externalReference: "SHIP-1",
      data: shipmentData(),
      idempotencyKey: "source-order-100"
    });

    assert.equal(
      replay.shipmentId,
      first.shipmentId
    );
    assert.equal(replay.idempotentReplay, true);

    await assert.rejects(
      () =>
        store.createShipment({
          organizationId:
            organization.organizationId,
          externalReference: "SHIP-CHANGED",
          data: shipmentData(),
          idempotencyKey: "source-order-100"
        }),
      (error) =>
        error.code === "IDEMPOTENCY_CONFLICT"
    );
  });
});

test("persists immutable regulatory versions and rejects divergent heads", async () => {
  await withStore(async ({ store }) => {
    const organization =
      await store.createOrganization({
        name: "Organization 001"
      });
    const shipment =
      await store.createShipment({
        organizationId:
          organization.organizationId,
        externalReference:
          "SHIP-ECMR-LEDGER-1",
        data: shipmentData()
      });

    const initialChain =
      createEcmrAmendmentChain({
        xml:
          "<rsm:eCMR>original</rsm:eCMR>",
        actor: {
          actorId:
            "ES-B12345678",
          partyRole:
            "sender",
          identityScheme:
            "tax-id"
        },
        reason:
          "initial issue",
        createdAt:
          "2026-10-03T05:10:00.000Z",
        idFactory:
          () => "ledger-one"
      });

    const first =
      await store.appendRegulatoryVersion({
        organizationId:
          organization.organizationId,
        shipmentId:
          shipment.shipmentId,
        regulatoryType:
          "ecmr",
        record:
          initialChain[0]
      });

    const secondChain =
      appendEcmrAmendment({
        chain:
          initialChain,
        xml:
          "<rsm:eCMR>corrected</rsm:eCMR>",
        actor: {
          actorId:
            "ES-B87654321",
          partyRole:
            "carrier",
          identityScheme:
            "tax-id"
        },
        reason:
          "correct consignee",
        createdAt:
          "2026-10-03T05:11:00.000Z",
        idFactory:
          () => "ledger-two"
      });

    const second =
      await store.appendRegulatoryVersion({
        organizationId:
          organization.organizationId,
        shipmentId:
          shipment.shipmentId,
        regulatoryType:
          "ecmr",
        record:
          secondChain[1]
      });

    assert.equal(
      first.version,
      1
    );
    assert.equal(
      second.version,
      2
    );

    const listed =
      await store.listRegulatoryVersions({
        organizationId:
          organization.organizationId,
        shipmentId:
          shipment.shipmentId,
        regulatoryType:
          "ecmr"
      });

    assert.deepEqual(
      listed.map(
        (entry) =>
          entry.version
      ),
      [1, 2]
    );
    assert.equal(
      listed[0].xml,
      "<rsm:eCMR>original</rsm:eCMR>"
    );
    assert.equal(
      listed[1]
        .previousVersionId,
      listed[0].versionId
    );

    const loaded =
      await store.getRegulatoryVersion({
        organizationId:
          organization.organizationId,
        versionId:
          second.versionId
      });

    assert.equal(
      loaded.chainHash,
      second.chainHash
    );

    const divergent =
      {
        ...secondChain[1],
        versionId:
          "ecmrv_divergent",
        chainHash:
          secondChain[1]
            .chainHash
      };

    await assert.rejects(
      () =>
        store.appendRegulatoryVersion({
          organizationId:
            organization.organizationId,
          shipmentId:
            shipment.shipmentId,
          regulatoryType:
            "ecmr",
          record:
            divergent
        }),
      (error) =>
        error.code ===
        "REGULATORY_VERSION_HEAD_CONFLICT"
    );

    const audit =
      await store.listAuditEvents({
        organizationId:
          organization.organizationId,
        shipmentId:
          shipment.shipmentId
      });

    assert.equal(
      audit.filter(
        (entry) =>
          entry.type ===
          "regulatory.version.created"
      ).length,
      2
    );
  });
});

test("stores immutable document versions and audit lineage", async () => {
  await withStore(async ({ store }) => {
    const organization =
      await store.createOrganization({
        name: "Organization 001"
      });

    const shipment = await store.createShipment({
      organizationId: organization.organizationId,
      externalReference: "SHIP-1",
      data: shipmentData()
    });

    const first = await store.appendDocumentVersion({
      organizationId: organization.organizationId,
      shipmentId: shipment.shipmentId,
      snapshot: snapshot(),
      artifact: {
        size: 12345,
        sha256: "sha256:pdf-one"
      }
    });

    const second =
      await store.appendDocumentVersion({
        organizationId:
          organization.organizationId,
        shipmentId: shipment.shipmentId,
        snapshot: snapshot({
          documentId: "deca_0002",
          version: 2,
          previousVersionId:
            first.documentId
        }),
        artifact: {
          size: 12400,
          sha256: "sha256:pdf-two"
        }
      });

    assert.equal(second.version, 2);

    const loadedShipment =
      await store.getShipment({
        organizationId:
          organization.organizationId,
        shipmentId: shipment.shipmentId
      });

    assert.deepEqual(
      loadedShipment.documentVersionIds,
      ["deca_0001", "deca_0002"]
    );

    const events = await store.listAuditEvents({
      organizationId:
        organization.organizationId,
      shipmentId: shipment.shipmentId
    });

    assert.deepEqual(
      events.map((event) => event.type),
      [
        "shipment.created",
        "document.version.created",
        "document.version.created"
      ]
    );

    await assert.rejects(
      () =>
        store.appendDocumentVersion({
          organizationId:
            organization.organizationId,
          shipmentId: shipment.shipmentId,
          snapshot: snapshot({
            documentId: "deca_0002",
            version: 2,
            previousVersionId:
              first.documentId
          })
        }),
      (error) =>
        error.code === "DOCUMENT_VERSION_EXISTS"
    );
  });
});
