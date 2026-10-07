import { readFile } from "node:fs/promises";

const source = await readFile(
  "scripts/production/atlas-core-acceptance.mjs",
  "utf8"
);

for (const required of [
  "process.execPath",
  "export const runAtlasCoreAcceptance",
  "env = process.env",
  "isDirectExecution",
  "./preflight.mjs",
  "./atlas-gridfs-smoke.mjs",
  "./atlas-concurrency-smoke.mjs",
  "../retention/retention-cli.mjs",
  "--topology=in-process",
  "reconcile",
  "deca-atlas-core-acceptance",
  "deca-only",
  "missingBeforeRetention",
  "missingAfterRetention",
  "orphanedArtifacts",
  "purgedArtifactsStillPresent"
]) {
  if (!source.includes(required)) {
    throw new Error(
      `Atlas core acceptance is missing ${required}`
    );
  }
}

for (const forbidden of [
  "npmCommand",
  "npm.cmd",
  '"npm"',
  "production:kairoseth-health-smoke",
  "production:public-pdf-smoke",
  "DECA_SMOKE_PUBLIC_URL",
  "DECA_SMOKE_EXPECTED_SHA256",
  "ecmr",
  "REGULATORY_VERSION_"
]) {
  if (source.toLowerCase().includes(
    forbidden.toLowerCase()
  )) {
    throw new Error(
      `Focused Atlas core acceptance must not depend on package-manager/runtime-external or already-closed scope: ${forbidden}`
    );
  }
}

if (
  /SKIP_|BYPASS_|FORCE_|IGNORE_FAILURE/i.test(
    source
  )
) {
  throw new Error(
    "Atlas core acceptance must not expose bypass controls"
  );
}

if (
  /MONGODB_URI|KAIROSETH_SERVICE_SECRET/.test(
    source
  )
) {
  throw new Error(
    "Atlas core orchestration must delegate secret validation and never inspect or print production credentials"
  );
}

if (
  !source.includes("if (isDirectExecution)") ||
  !source.includes("runAtlasCoreAcceptance();")
) {
  throw new Error(
    "Atlas core acceptance must remain import-safe and execute the CLI only behind the direct-execution guard"
  );
}

console.log(
  "Atlas core acceptance contract OK (import-safe in-process entry with injectable environment, runtime-portable direct Node steps, DeCA-only Atlas/GridFS/concurrency/reconciliation, no edge recoupling, no bypasses)"
);
