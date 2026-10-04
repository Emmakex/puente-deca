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

test("persists immutable eCMR amendment versions with tenant and lineage isolation", async () => {
  await withStore(async ({ store }) => {
    const firstOrganization =
      await store.createOrganization({
        name: "First"
      });
    const secondOrganization =
      await store.createOrganization({
        name: "Second"
      });

    const shipment =
      await store.createShipment({
        organizationId:
          firstOrganization.organizationId,
        externalReference:
          "ECMR-SHIP-1",
        data:
          shipmentData()
      });

    const original =
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
          "2026-10-03T05:20:00.000Z",
        idFactory:
          () => "ecmr-one"
      });

    const first =
      await store
        .appendEcmrAmendmentVersion({
          organizationId:
            firstOrganization.organizationId,
          shipmentId:
            shipment.shipmentId,
          record:
            original[0]
        });

    assert.equal(
      first.version,
      1
    );
    assert.equal(
      first.xml,
      original[0].xml
    );

    const revised =
      appendEcmrAmendment({
        chain:
          original,
        xml:
          "<rsm:eCMR>corrected</rsm:eCMR>",
        actor: {
          actorId:
            "ES-B12345678",
          partyRole:
            "sender",
          identityScheme:
            "tax-id"
        },
        reason:
          "correct consignee",
        createdAt:
          "2026-10-03T05:25:00.000Z",
        idFactory:
          () => "ecmr-two"
      });

    const second =
      await store
        .appendEcmrAmendmentVersion({
          organizationId:
            firstOrganization.organizationId,
          shipmentId:
            shipment.shipmentId,
          record:
            revised[1]
        });

    assert.equal(
      second.version,
      2
    );
    assert.equal(
      second.previousVersionId,
      first.versionId
    );
    assert.equal(
      second.originalContentHash,
      first.contentHash
    );

    const versions =
      await store
        .listEcmrAmendmentVersions({
          organizationId:
            firstOrganization.organizationId,
          shipmentId:
            shipment.shipmentId
        });

    assert.deepEqual(
      versions.map(
        (entry) =>
          entry.version
      ),
      [1, 2]
    );
    assert.deepEqual(
      versions.map(
        (entry) =>
          entry.xml
      ),
      [
        "<rsm:eCMR>original</rsm:eCMR>",
        "<rsm:eCMR>corrected</rsm:eCMR>"
      ]
    );

    assert.deepEqual(
      await store
        .listEcmrAmendmentVersions({
          organizationId:
            secondOrganization.organizationId,
          shipmentId:
            shipment.shipmentId
        }),
      []
    );

    await assert.rejects(
      () =>
        store
          .appendEcmrAmendmentVersion({
            organizationId:
              firstOrganization.organizationId,
            shipmentId:
              shipment.shipmentId,
            record:
              revised[1]
          }),
      (error) =>
        error.code ===
        "ECMR_AMENDMENT_VERSION_EXISTS"
    );

    const events =
      await store.listAuditEvents({
        organizationId:
          firstOrganization.organizationId,
        shipmentId:
          shipment.shipmentId
      });

    assert.deepEqual(
      events.map(
        (entry) =>
          entry.type
      ),
      [
        "shipment.created",
        "ecmr.amendment.version.created",
        "ecmr.amendment.version.created"
      ]
    );
  });
});

test("rejects eCMR amendment versions that do not extend the persisted lineage", async () => {
  await withStore(async ({ store }) => {
    const organization =
      await store.createOrganization({
        name:
          "Organization 001"
      });
    const shipment =
      await store.createShipment({
        organizationId:
          organization.organizationId,
        externalReference:
          "ECMR-SHIP-2",
        data:
          shipmentData()
      });

    const original =
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
          "2026-10-03T05:20:00.000Z",
        idFactory:
          () => "one"
      });
    const revised =
      appendEcmrAmendment({
        chain:
          original,
        xml:
          "<rsm:eCMR>revision</rsm:eCMR>",
        actor: {
          actorId:
            "ES-B12345678",
          partyRole:
            "sender",
          identityScheme:
            "tax-id"
        },
        reason:
          "revision",
        createdAt:
          "2026-10-03T05:25:00.000Z",
        idFactory:
          () => "two"
      });

    await assert.rejects(
      () =>
        store
          .appendEcmrAmendmentVersion({
            organizationId:
              organization.organizationId,
            shipmentId:
              shipment.shipmentId,
            record:
              revised[1]
          }),
      (error) =>
        error.code ===
        "ECMR_AMENDMENT_LINEAGE_CONFLICT"
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
