import { readFile } from "node:fs/promises";

const preflight = await readFile(
  "apps/api/src/production-preflight.mjs",
  "utf8"
);
const main = await readFile(
  "apps/api/src/main.mjs",
  "utf8"
);

const requirePattern = (
  source,
  pattern,
  message
) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requirePattern(
  preflight,
  /https:\/\/kairoseth\.com\/deca/,
  "Production public DeCA base URL must be pinned to kairoseth.com"
);
requirePattern(
  preflight,
  /MONGODB_DB_NAME must be kairoseth/,
  "Production database name guard is missing"
);
requirePattern(
  preflight,
  /PERSISTENCE_DRIVER must be mongodb/,
  "Production metadata driver guard is missing"
);
requirePattern(
  preflight,
  /ARTIFACT_DRIVER must be gridfs/,
  "Production artifact driver guard is missing"
);
requirePattern(
  preflight,
  /ALLOW_JSON_STORE_IN_PRODUCTION/,
  "Emergency JSON override guard is missing"
);
requirePattern(
  preflight,
  /ALLOW_FILE_ARTIFACTS_IN_PRODUCTION/,
  "Emergency filesystem override guard is missing"
);
requirePattern(
  preflight,
  /KAIROSETH_SERVICE_SECRET/,
  "Server-to-server secret validation is missing"
);
requirePattern(
  main,
  /assertProductionEnvironment/,
  "Runtime must execute production preflight before opening dependencies"
);

const assertIndex =
  main.indexOf("assertProductionEnvironment");
const mongoIndex =
  main.indexOf("openKairosethMongoClient");

if (
  assertIndex < 0 ||
  mongoIndex < 0 ||
  assertIndex > mongoIndex
) {
  throw new Error(
    "Production preflight must run before opening MongoDB"
  );
}

console.log(
  "Production preflight contract OK (canonical URL, Atlas/GridFS, emergency overrides disabled, fail-before-connect)"
);
