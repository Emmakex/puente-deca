import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../src/json-store.mjs";
import {
  FileArtifactStore
} from "../src/file-artifact-store.mjs";
import {
  inspectRetention,
  purgeEligibleArtifacts,
  reconcileArtifacts
} from "../src/retention.mjs";

const openFixture = async ({
  now = () => new Date("2026-10-03T08:00:00.000Z")
} = {}) => {
  const directory = await mkdtemp(
    join(tmpdir(), "pdeca-retention-")
  );
  const store = await JsonStore.open({
    filePath: join(directory, "store.json"),
    now,
    idFactory: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })()
  });
  const artifactStore =
    await FileArtifactStore.open({
      rootDirectory: join(directory, "artifacts")
    });

  const organization =
    await store.createOrganization({
      name: "Retention Test"
    });

  return {
    directory,
    store,
    artifactStore,
    organization
  };
};

const createDocument = async ({
  store,
  artifactStore,
  organizationId,
  documentId,
  retentionNotBefore
}) => {
  const shipment = await store.createShipment({
    organizationId,
    externalReference:
      `ext-${documentId}`,
    data: {
      externalReference:
        `ext-${documentId}`,
      contractualShipper: {
        legalName: "Shipper SL",
        taxId: "B12345678",
        address: "Madrid"
      },
      effectiveCarrier: {
        legalName: "Carrier SL",
        taxId: "B87654321"
      },
      route: {
        origin: "Madrid",
        destination: "Barcelona"
      },
      goods: {
        nature: "Furniture",
        weight: {
          value: 10,
          unit: "kg"
        }
      },
      transport: {
        date: "2025-01-01",
        vehicle: {
          tractorRegistration: "1234ABC",
          trailerRegistration: null
        },
        specialTrafficAuthorization: null
      },
      observations: null
    }
  });

  const bytes = Buffer.from(
    `%PDF-retention-${documentId}`
  );
  const artifact = await artifactStore.save({
    documentId,
    bytes
  });

  await store.appendDocumentVersion({
    organizationId,
    shipmentId: shipment.shipmentId,
    snapshot: {
      documentType: "DECA",
      documentId,
      version: 1,
      previousVersionId: null,
      accessUrl:
        `https://kairoseth.com/deca/d/token-${documentId}.pdf`
    },
    artifact: {
      ...artifact,
      retentionNotBefore
    }
  });

  return {
    shipment,
    artifact,
    bytes
  };
};

test("retention purge is dry-run by default and preserves immutable metadata", async () => {
  const fixture = await openFixture();

  try {
    const created = await createDocument({
      ...fixture,
      organizationId:
        fixture.organization.organizationId,
      documentId: "doc_expired",
      retentionNotBefore:
        "2026-01-02T00:00:00.000Z"
    });

    const inspection = await inspectRetention({
      store: fixture.store,
      artifactStore:
        fixture.artifactStore,
      asOf:
        "2026-10-03T08:00:00.000Z"
    });

    assert.equal(inspection.count, 1);

    const dryRun = await purgeEligibleArtifacts({
      store: fixture.store,
      artifactStore:
        fixture.artifactStore,
      asOf:
        "2026-10-03T08:00:00.000Z",
      confirm: false
    });

    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.purged.length, 0);
    assert.deepEqual(
      await fixture.artifactStore.read(
        created.artifact.storageKey
      ),
      created.bytes
    );

    const purged = await purgeEligibleArtifacts({
      store: fixture.store,
      artifactStore:
        fixture.artifactStore,
      asOf:
        "2026-10-03T08:00:00.000Z",
      confirm: true
    });

    assert.equal(purged.dryRun, false);
    assert.equal(purged.purged.length, 1);

    await assert.rejects(
      fixture.artifactStore.read(
        created.artifact.storageKey
      ),
      (error) => error?.code === "ENOENT"
    );

    const version =
      await fixture.store.getDocumentVersion({
        organizationId:
          fixture.organization.organizationId,
        documentId: "doc_expired"
      });

    assert.equal(
      version.documentId,
      "doc_expired"
    );
    assert.equal(
      version.artifact.storageKey,
      created.artifact.storageKey
    );

    const records =
      await fixture.store.listArtifactPurgeRecords();
    assert.equal(records.length, 1);
    assert.equal(
      records[0].reason,
      "retention_period_elapsed"
    );

    const events =
      await fixture.store.listAuditEvents({
        organizationId:
          fixture.organization.organizationId,
        shipmentId:
          created.shipment.shipmentId
      });

    assert.ok(
      events.some(
        (event) =>
          event.type ===
          "artifact.retention.purged"
      )
    );
  } finally {
    await rm(fixture.directory, {
      recursive: true,
      force: true
    });
  }
});

test("retention record cannot be created before the legal floor", async () => {
  const fixture = await openFixture();

  try {
    const created = await createDocument({
      ...fixture,
      organizationId:
        fixture.organization.organizationId,
      documentId: "doc_active",
      retentionNotBefore:
        "2027-01-01T00:00:00.000Z"
    });

    await assert.rejects(
      fixture.store.recordArtifactPurge({
        organizationId:
          fixture.organization.organizationId,
        shipmentId:
          created.shipment.shipmentId,
        documentId: "doc_active",
        storageKey:
          created.artifact.storageKey,
        expectedRetentionNotBefore:
          "2027-01-01T00:00:00.000Z",
        artifactWasPresent: true,
        reason: "should_not_happen"
      }),
      (error) =>
        error?.code ===
        "ARTIFACT_RETENTION_ACTIVE"
    );

    assert.equal(
      (
        await fixture.store
          .listArtifactPurgeRecords()
      ).length,
      0
    );
  } finally {
    await rm(fixture.directory, {
      recursive: true,
      force: true
    });
  }
});

test("artifact reconciliation reports premature loss and orphans without deleting them", async () => {
  const fixture = await openFixture();

  try {
    const created = await createDocument({
      ...fixture,
      organizationId:
        fixture.organization.organizationId,
      documentId: "doc_future",
      retentionNotBefore:
        "2027-01-01T00:00:00.000Z"
    });

    await fixture.artifactStore.remove(
      created.artifact.storageKey
    );

    await fixture.artifactStore.save({
      documentId: "orphan_document",
      bytes: Buffer.from("%PDF-orphan")
    });

    const report = await reconcileArtifacts({
      store: fixture.store,
      artifactStore:
        fixture.artifactStore,
      asOf:
        "2026-10-03T08:00:00.000Z"
    });

    assert.equal(
      report.counts.missingBeforeRetention,
      1
    );
    assert.equal(
      report.missingBeforeRetention[0]
        .documentId,
      "doc_future"
    );
    assert.deepEqual(
      report.orphanedArtifacts,
      ["orphan_document.pdf"]
    );

    assert.deepEqual(
      await fixture.artifactStore
        .listStorageKeys(),
      ["orphan_document.pdf"]
    );
  } finally {
    await rm(fixture.directory, {
      recursive: true,
      force: true
    });
  }
});
