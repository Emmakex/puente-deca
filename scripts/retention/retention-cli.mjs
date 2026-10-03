import {
  openOperationalStore,
  resolvePersistenceDriver
} from "../../packages/persistence/src/store-factory.mjs";
import {
  openArtifactStore,
  resolveArtifactDriver
} from "../../packages/persistence/src/artifact-store-factory.mjs";
import {
  openKairosethMongoClient
} from "../../packages/persistence/src/mongo-client.mjs";
import {
  inspectRetention,
  purgeEligibleArtifacts,
  reconcileArtifacts
} from "../../packages/persistence/src/retention.mjs";

const mode = process.argv[2] ?? "inspect";
const asOf =
  process.env.RETENTION_AS_OF ??
  new Date().toISOString();
const parsedLimit = Number.parseInt(
  process.env.RETENTION_LIMIT ?? "100",
  10
);
const limit = Number.isInteger(parsedLimit)
  ? Math.min(1000, Math.max(1, parsedLimit))
  : 100;

const persistenceDriver =
  resolvePersistenceDriver();
const artifactDriver =
  resolveArtifactDriver();

let mongoClient = null;
let store = null;
let artifactStore = null;

try {
  if (
    persistenceDriver === "mongodb" ||
    artifactDriver === "gridfs"
  ) {
    mongoClient =
      await openKairosethMongoClient({
        uri: process.env.MONGODB_URI
      });
  }

  store = await openOperationalStore({
    mongoClient
  });
  artifactStore = await openArtifactStore({
    mongoClient
  });

  let result;

  if (mode === "inspect") {
    result = await inspectRetention({
      store,
      artifactStore,
      asOf,
      limit
    });
  } else if (mode === "purge") {
    const confirmed =
      process.env.RETENTION_PURGE_CONFIRM ===
      "PURGE_ELIGIBLE_DECA_PDFS";

    result = await purgeEligibleArtifacts({
      store,
      artifactStore,
      asOf,
      limit,
      confirm: confirmed
    });

    if (!confirmed) {
      result.warning =
        "Dry run only. Set RETENTION_PURGE_CONFIRM=PURGE_ELIGIBLE_DECA_PDFS to delete eligible PDFs.";
    }
  } else if (mode === "reconcile") {
    result = await reconcileArtifacts({
      store,
      artifactStore,
      asOf
    });
  } else {
    throw new Error(
      "Mode must be inspect, purge or reconcile"
    );
  }

  process.stdout.write(
    `${JSON.stringify(result, null, 2)}\n`
  );
} finally {
  if (
    artifactStore &&
    typeof artifactStore.close === "function"
  ) {
    await artifactStore.close();
  }
  if (
    store &&
    typeof store.close === "function"
  ) {
    await store.close();
  }
  if (mongoClient) {
    await mongoClient.close();
  }
}
