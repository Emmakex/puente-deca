import { readFile } from "node:fs/promises";

const source = await readFile(
  "scripts/production/atlas-core-acceptance.mjs",
  "utf8"
);

for (const required of [
  "production:preflight",
  "production:atlas-smoke",
  "production:atlas-concurrency-smoke",
  "artifacts:reconcile",
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
      `Focused Atlas core acceptance must not depend on already-closed or frozen scope: ${forbidden}`
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

console.log(
  "Atlas core acceptance contract OK (DeCA-only Atlas/GridFS/concurrency/reconciliation, no edge recoupling, no bypasses)"
);
