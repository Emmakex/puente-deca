import {
  createHash,
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
import {
  GridFsArtifactStore
} from "../../packages/persistence/src/gridfs-artifact-store.mjs";
import {
  verifyAtlasIndexContract
} from "./atlas-index-contract.mjs";

const sha256 = (bytes) =>
  `sha256:${createHash("sha256")
    .update(bytes)
    .digest("hex")}`;

const safeFailure = (code) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check: "atlas-gridfs-smoke",
      code
    })}\n`
  );
  process.exitCode = 1;
};

let client = null;
let metadataStore = null;
let artifactStore = null;
let savedArtifact = null;

try {
  const preflight =
    assertProductionEnvironment(
      process.env,
      { topology: "in-process" }
    );

  client = await openKairosethMongoClient({
    uri: process.env.MONGODB_URI,
    appName:
      "kairoseth-puente-deca-smoke"
  });

  metadataStore =
    await MongoStore.open({
      client,
      databaseName:
        process.env.MONGODB_DB_NAME
    });

  artifactStore =
    await GridFsArtifactStore.open({
      client,
      databaseName:
        process.env.MONGODB_DB_NAME,
      bucketName:
        process.env.DECA_GRIDFS_BUCKET
    });

  await Promise.all([
    metadataStore.probe(),
    artifactStore.probe()
  ]);

  const database = client.db(
    process.env.MONGODB_DB_NAME
  );

  const indexEvidence =
    await verifyAtlasIndexContract({
      database,
      bucketName:
        process.env.DECA_GRIDFS_BUCKET
    });

  const smokeOrganizationId =
    `__pdeca_smoke_${randomUUID()}`;
  const rollbackSentinel =
    new Error("ROLLBACK_SENTINEL");
  const session =
    client.startSession();

  try {
    await session.withTransaction(
      async () => {
        await database
          .collection(
            "deca_organizations"
          )
          .insertOne(
            {
              organizationId:
                smokeOrganizationId,
              name:
                "Puente DeCA transaction smoke",
              externalReference:
                smokeOrganizationId,
              createdAt: new Date(),
              updatedAt: new Date()
            },
            { session }
          );

        throw rollbackSentinel;
      },
      {
        readConcern: {
          level: "snapshot"
        },
        writeConcern: {
          w: "majority"
        }
      }
    );
  } catch (error) {
    if (
      error !== rollbackSentinel
    ) {
      throw error;
    }
  } finally {
    await session.endSession();
  }

  const leakedTransactionRecord =
    await database
      .collection(
        "deca_organizations"
      )
      .findOne({
        organizationId:
          smokeOrganizationId
      });

  if (leakedTransactionRecord) {
    throw Object.assign(
      new Error(
        "transaction rollback left a smoke record"
      ),
      {
        code:
          "ATLAS_TRANSACTION_ROLLBACK_FAILED"
      }
    );
  }

  const documentId =
    `smoke_${randomUUID()}`;
  const pdf = Buffer.from(
    [
      "%PDF-1.7",
      "% Puente DeCA Atlas/GridFS smoke",
      "%%EOF",
      ""
    ].join("\n"),
    "utf8"
  );

  savedArtifact =
    await artifactStore.save({
      documentId,
      bytes: pdf
    });

  const restored =
    await artifactStore.read(
      savedArtifact.storageKey
    );

  if (
    !restored.equals(pdf) ||
    sha256(restored) !==
      savedArtifact.sha256
  ) {
    throw Object.assign(
      new Error(
        "GridFS round-trip integrity mismatch"
      ),
      {
        code:
          "GRIDFS_INTEGRITY_MISMATCH"
      }
    );
  }

  const removed =
    await artifactStore.remove(
      savedArtifact.storageKey
    );
  savedArtifact = null;

  if (!removed) {
    throw Object.assign(
      new Error(
        "GridFS smoke artifact was not removed"
      ),
      {
        code:
          "GRIDFS_CLEANUP_FAILED"
      }
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          "atlas-gridfs-smoke",
        database:
          preflight.target.database,
        artifactBucket:
          preflight.target
            .artifactBucket,
        metadataPing: true,
        artifactPing: true,
        indexContract: true,
        metadataIndexesVerified:
          indexEvidence.metadataIndexes,
        gridFsIndexesVerified:
          indexEvidence.gridFsIndexes,
        transactionRollback: true,
        gridfsRoundTrip: true,
        gridfsCleanup: true
      },
      null,
      2
    )}\n`
  );
} catch (error) {
  if (
    savedArtifact &&
    artifactStore
  ) {
    await artifactStore
      .remove(
        savedArtifact.storageKey
      )
      .catch(() => undefined);
  }

  safeFailure(
    typeof error?.code === "string"
      ? error.code
      : "ATLAS_SMOKE_FAILED"
  );
} finally {
  if (
    artifactStore &&
    typeof artifactStore.close ===
      "function"
  ) {
    await artifactStore
      .close()
      .catch(() => undefined);
  }

  if (
    metadataStore &&
    typeof metadataStore.close ===
      "function"
  ) {
    await metadataStore
      .close()
      .catch(() => undefined);
  }

  if (client) {
    await client
      .close()
      .catch(() => undefined);
  }
}
