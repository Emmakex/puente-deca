import { createServer } from "./server.mjs";
import {
  openOperationalStore,
  resolvePersistenceDriver
} from "../../../packages/persistence/src/store-factory.mjs";
import {
  openArtifactStore,
  resolveArtifactDriver
} from "../../../packages/persistence/src/artifact-store-factory.mjs";
import {
  openKairosethMongoClient
} from "../../../packages/persistence/src/mongo-client.mjs";

const port = Number.parseInt(
  process.env.PORT ?? "8080",
  10
);

const persistenceDriver =
  resolvePersistenceDriver();
const artifactDriver =
  resolveArtifactDriver();

let mongoClient = null;

if (
  persistenceDriver === "mongodb" ||
  artifactDriver === "gridfs"
) {
  mongoClient =
    await openKairosethMongoClient({
      uri: process.env.MONGODB_URI
    });
}

const store = await openOperationalStore({
  mongoClient
});
const artifactStore = await openArtifactStore({
  mongoClient
});

const server = createServer({
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ??
    "https://deca.example.com",
  store,
  artifactStore
});

let closing = false;

const shutdown = (signal) => {
  if (closing) return;
  closing = true;

  console.log(
    `Puente DeCA received ${signal}; shutting down`
  );

  server.close(async () => {
    try {
      if (typeof artifactStore.close === "function") {
        await artifactStore.close();
      }
      if (typeof store.close === "function") {
        await store.close();
      }
      if (mongoClient) {
        await mongoClient.close();
      }
      process.exit(0);
    } catch (error) {
      console.error(
        "Puente DeCA shutdown failed",
        error
      );
      process.exit(1);
    }
  });
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

server.listen(port, () => {
  console.log(
    `Puente DeCA API listening on :${port}`
  );
});
