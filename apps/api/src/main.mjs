import { join } from "node:path";
import { createServer } from "./server.mjs";
import { JsonStore } from "../../../packages/persistence/src/json-store.mjs";
import { FileArtifactStore } from "../../../packages/persistence/src/file-artifact-store.mjs";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const dataDirectory = process.env.DATA_DIR ?? "./data";

const store = await JsonStore.open({
  filePath: join(dataDirectory, "state.json")
});

const artifactStore = await FileArtifactStore.open({
  rootDirectory: join(dataDirectory, "artifacts")
});

const server = createServer({
  store,
  artifactStore
});

server.listen(port, () => {
  console.log(`Puente DeCA API listening on :${port}`);
});
