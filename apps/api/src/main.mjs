import { createServer } from "./server.mjs";
import {
  openOperationalStore
} from "../../../packages/persistence/src/store-factory.mjs";
import {
  FileArtifactStore
} from "../../../packages/persistence/src/file-artifact-store.mjs";

const port = Number.parseInt(
  process.env.PORT ?? "8080",
  10
);

const store = await openOperationalStore();

const artifactStore =
  await FileArtifactStore.open({
    rootDirectory:
      process.env.ARTIFACT_DIR ??
      ".data/documents"
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
      if (typeof store.close === "function") {
        await store.close();
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

process.once(
  "SIGTERM",
  () => shutdown("SIGTERM")
);
process.once(
  "SIGINT",
  () => shutdown("SIGINT")
);

server.listen(port, () => {
  console.log(
    `Puente DeCA API listening on :${port}`
  );
});
