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
  preflight,
  /KAIROSETH_PUBLIC_PROXY_SECRET/,
  "Public proxy secret validation is missing"
);
requirePattern(
  main,
  /assertProductionEnvironment/,
  "Runtime must execute production preflight before opening dependencies"
);

const assertIndex =
  main.indexOf("assertProductionEnvironment();");
const mongoIndex =
  main.indexOf("await openKairosethMongoClient");

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


const server = await readFile(
  "apps/api/src/server.mjs",
  "utf8"
);

requirePattern(
  server,
  /standaloneToolsEnabled\s*=\s*process\.env\.NODE_ENV\s*!==\s*"production"/,
  "Standalone DeCA tools must default off in production"
);
requirePattern(
  server,
  /standaloneToolPath[\s\S]*status|standaloneToolPath[\s\S]*404|standaloneToolPath[\s\S]*sendJson\(response, 404/,
  "Production standalone-tool guard must return 404"
);

if (
  /ALLOW_STANDALONE/i.test(server)
) {
  throw new Error(
    "Production standalone tools must not have an environment escape hatch"
  );
}

console.log(
  "Standalone production surface contract OK (lab validate/snapshot/pdf hidden)"
);
