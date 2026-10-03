import { readFile } from "node:fs/promises";

const main = await readFile(
  "apps/api/src/main.mjs",
  "utf8"
);
const storeFactory = await readFile(
  "packages/persistence/src/store-factory.mjs",
  "utf8"
);
const artifactFactory = await readFile(
  "packages/persistence/src/artifact-store-factory.mjs",
  "utf8"
);

if (!/openKairosethMongoClient/.test(main)) {
  throw new Error("Runtime must open one shared MongoDB client");
}
if (!/mongoClient/.test(storeFactory)) {
  throw new Error("Metadata store must accept the shared MongoDB client");
}
if (!/mongoClient/.test(artifactFactory)) {
  throw new Error("GridFS store must accept the shared MongoDB client");
}
if ((main.match(/openKairosethMongoClient/g) ?? []).length !== 2) {
  throw new Error("Expected one import and one runtime MongoDB client open call");
}

console.log("Shared MongoDB client contract OK");
