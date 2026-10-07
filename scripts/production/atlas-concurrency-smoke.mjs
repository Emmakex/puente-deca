import {
  randomUUID
} from "node:crypto";
import {
  assertProductionEnvironment
} from "../../apps/api/src/production-preflight.mjs";
import {
  openKairosethMongoClient
} from "../../packages/persistence/src/mongo-client.mjs";
import {
  MongoStore
} from "../../packages/persistence/src/mongo-store.mjs";

const SERVICE_COLLECTIONS = [
  "deca_artifact_purges",
  "deca_audit_events",
  "deca_document_versions",
  "deca_idempotency",
  "deca_shipments",
  "deca_api_credentials",
  "deca_organizations"
];

const safeFailure = (code) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check:
        "atlas-concurrency-smoke",
      code
    })}\n`
  );
  process.exitCode = 1;
};

const cleanupOrganization =
  async (
    database,
    organizationId
  ) => {
    for (
      const collectionName of
      SERVICE_COLLECTIONS
    ) {
      await database
        .collection(collectionName)
        .deleteMany({
          organizationId
        });
    }
  };

const countOrganizationRecords =
  async (
    database,
    organizationId
  ) => {
    let total = 0;

    for (
      const collectionName of
      SERVICE_COLLECTIONS
    ) {
      total +=
        await database
          .collection(
            collectionName
          )
          .countDocuments({
            organizationId
          });
    }

    return total;
  };

const assertConcurrentShipmentResult =
  (
    results
  ) => {
    const fulfilled = results
      .filter(
        (result) =>
          result.status ===
          "fulfilled"
      )
      .map(
        (result) =>
          result.value
      );

    const rejected =
      results.filter(
        (result) =>
          result.status ===
          "rejected"
      );

    if (
      fulfilled.length < 1 ||
      fulfilled.filter(
        (shipment) =>
          shipment
            .idempotentReplay ===
          false
      ).length !== 1
    ) {
      throw Object.assign(
        new Error(
          "Concurrent idempotent shipment creation did not produce exactly one fresh write"
        ),
        {
          code:
            "ATLAS_IDEMPOTENCY_CONCURRENCY_FAILED"
        }
      );
    }

    const shipmentIds =
      new Set(
        fulfilled.map(
          (shipment) =>
            shipment.shipmentId
        )
      );

    if (
      shipmentIds.size !== 1 ||
      rejected.some(
        (result) =>
          result.reason?.code !==
          "IDEMPOTENCY_RETRY"
      )
    ) {
      throw Object.assign(
        new Error(
          "Concurrent idempotent shipment results were inconsistent"
        ),
        {
          code:
            "ATLAS_IDEMPOTENCY_CONCURRENCY_FAILED"
        }
      );
    }

    return fulfilled[0]
      .shipmentId;
  };

const assertConcurrentDocumentResult =
  (
    results
  ) => {
    const fulfilled = results
      .filter(
        (result) =>
          result.status ===
          "fulfilled"
      )
      .map(
        (result) =>
          result.value
      );

    const rejected =
      results.filter(
        (result) =>
          result.status ===
          "rejected"
      );

    if (
      fulfilled.length !== 1 ||
      rejected.length !== 1
    ) {
      throw Object.assign(
        new Error(
          "Concurrent document version creation did not produce one winner and one rejected collision"
        ),
        {
          code:
            "ATLAS_DOCUMENT_CONCURRENCY_FAILED"
        }
      );
    }

    if (
      ![
        "DOCUMENT_VERSION_EXISTS",
        "DOCUMENT_LINEAGE_CONFLICT"
      ].includes(
        rejected[0]
          .reason?.code
      )
    ) {
      throw Object.assign(
        new Error(
          "Concurrent document version collision returned an unexpected error"
        ),
        {
          code:
            "ATLAS_DOCUMENT_CONCURRENCY_FAILED"
        }
      );
    }

    return fulfilled[0];
  };

let client = null;
let store = null;
let database = null;
let smokeOrganizationId = null;

try {
  const preflight =
    assertProductionEnvironment(
      process.env,
      { topology: "in-process" }
    );

  client =
    await openKairosethMongoClient({
      uri:
        process.env.MONGODB_URI,
      appName:
        "kairoseth-puente-deca-concurrency-smoke"
    });

  store =
    await MongoStore.open({
      client,
      databaseName:
        process.env.MONGODB_DB_NAME
    });

  database = client.db(
    process.env.MONGODB_DB_NAME
  );

  smokeOrganizationId =
    `__pdeca_concurrency_${randomUUID()}`;

  await store.ensureOrganization({
    organizationId:
      smokeOrganizationId,
    name:
      "Puente DeCA concurrency smoke",
    externalReference:
      smokeOrganizationId
  });

  const shipmentInput = {
    organizationId:
      smokeOrganizationId,
    externalReference:
      "CONCURRENCY-SMOKE-001",
    idempotencyKey:
      "same-request",
    data: {
      route: {
        origin: "Madrid",
        destination: "Barcelona"
      },
      goods: {
        nature:
          "Concurrency smoke cargo"
      },
      transport: {
        date: "2026-10-05"
      }
    }
  };

  const shipmentRace =
    await Promise.allSettled([
      store.createShipment(
        shipmentInput
      ),
      store.createShipment(
        shipmentInput
      )
    ]);

  const shipmentId =
    assertConcurrentShipmentResult(
      shipmentRace
    );

  const replay =
    await store.createShipment(
      shipmentInput
    );

  if (
    replay.shipmentId !==
      shipmentId ||
    replay.idempotentReplay !==
      true
  ) {
    throw Object.assign(
      new Error(
        "Idempotency did not converge to the canonical shipment after concurrency"
      ),
      {
        code:
          "ATLAS_IDEMPOTENCY_CONVERGENCE_FAILED"
      }
    );
  }

  const [
    shipmentCount,
    idempotencyCount,
    shipmentAuditCount
  ] = await Promise.all([
    database
      .collection(
        "deca_shipments"
      )
      .countDocuments({
        organizationId:
          smokeOrganizationId
      }),
    database
      .collection(
        "deca_idempotency"
      )
      .countDocuments({
        organizationId:
          smokeOrganizationId
      }),
    database
      .collection(
        "deca_audit_events"
      )
      .countDocuments({
        organizationId:
          smokeOrganizationId,
        type:
          "shipment.created"
      })
  ]);

  if (
    shipmentCount !== 1 ||
    idempotencyCount !== 1 ||
    shipmentAuditCount !== 1
  ) {
    throw Object.assign(
      new Error(
        "Concurrent idempotency left duplicate persistence records"
      ),
      {
        code:
          "ATLAS_IDEMPOTENCY_DUPLICATE_RECORDS"
      }
    );
  }

  const buildSnapshot =
    (documentId) => ({
      documentType: "DECA",
      documentId,
      version: 1,
      previousVersionId: null,
      accessUrl:
        `https://kairoseth.com/deca/d/${documentId}.pdf`
    });

  const documentRace =
    await Promise.allSettled([
      store.appendDocumentVersion({
        organizationId:
          smokeOrganizationId,
        shipmentId,
        snapshot:
          buildSnapshot(
            `smoke_doc_a_${randomUUID()}`
          ),
        artifact: {}
      }),
      store.appendDocumentVersion({
        organizationId:
          smokeOrganizationId,
        shipmentId,
        snapshot:
          buildSnapshot(
            `smoke_doc_b_${randomUUID()}`
          ),
        artifact: {}
      })
    ]);

  const winningDocument =
    assertConcurrentDocumentResult(
      documentRace
    );

  const [
    documentCount,
    documentAuditCount,
    storedShipment
  ] = await Promise.all([
    database
      .collection(
        "deca_document_versions"
      )
      .countDocuments({
        organizationId:
          smokeOrganizationId,
        shipmentId
      }),
    database
      .collection(
        "deca_audit_events"
      )
      .countDocuments({
        organizationId:
          smokeOrganizationId,
        shipmentId,
        type:
          "document.version.created"
      }),
    database
      .collection(
        "deca_shipments"
      )
      .findOne({
        organizationId:
          smokeOrganizationId,
        shipmentId
      })
  ]);

  if (
    documentCount !== 1 ||
    documentAuditCount !== 1 ||
    !storedShipment ||
    storedShipment
      .documentVersionIds
      ?.length !== 1 ||
    storedShipment
      .documentVersionIds?.[0] !==
      winningDocument.documentId
  ) {
    throw Object.assign(
      new Error(
        "Concurrent document versioning left inconsistent lineage"
      ),
      {
        code:
          "ATLAS_DOCUMENT_LINEAGE_INCONSISTENT"
      }
    );
  }

  await cleanupOrganization(
    database,
    smokeOrganizationId
  );

  const residualRecords =
    await countOrganizationRecords(
      database,
      smokeOrganizationId
    );

  if (residualRecords !== 0) {
    throw Object.assign(
      new Error(
        "Concurrency smoke cleanup left residual records"
      ),
      {
        code:
          "ATLAS_CONCURRENCY_CLEANUP_FAILED"
      }
    );
  }

  smokeOrganizationId = null;

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          "atlas-concurrency-smoke",
        scope:
          "deca-only",
        database:
          preflight.target.database,
        idempotencyConcurrency:
          true,
        idempotencyConverged:
          true,
        documentVersionConcurrency:
          true,
        documentLineageConsistent:
          true,
        cleanupVerified:
          true
      },
      null,
      2
    )}\n`
  );
} catch (error) {
  if (
    database &&
    smokeOrganizationId
  ) {
    await cleanupOrganization(
      database,
      smokeOrganizationId
    ).catch(
      () => undefined
    );
  }

  safeFailure(
    typeof error?.code ===
      "string"
      ? error.code
      : "ATLAS_CONCURRENCY_SMOKE_FAILED"
  );
} finally {
  if (
    store &&
    typeof store.close ===
      "function"
  ) {
    await store.close()
      .catch(
        () => undefined
      );
  }

  if (client) {
    await client.close()
      .catch(
        () => undefined
      );
  }
}
