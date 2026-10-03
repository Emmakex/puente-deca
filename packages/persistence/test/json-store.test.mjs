import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../src/json-store.mjs";

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
