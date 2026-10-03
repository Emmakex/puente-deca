import { createServer } from "./server.mjs";
import {
  JsonStore
} from "../../../packages/persistence/src/json-store.mjs";
import {
  FileArtifactStore
} from "../../../packages/persistence/src/file-artifact-store.mjs";

const port = Number.parseInt(
  process.env.PORT ?? "8080",
  10
);
const store = await JsonStore.open({
  filePath:
    process.env.STORE_PATH ??
    ".data/store.json"
});
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

server.listen(port, () => {
  console.log(
    `Puente DeCA API listening on :${port}`
  );
});
