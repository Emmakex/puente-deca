import { readFile } from "node:fs/promises";

const smoke = await readFile(
  "scripts/production/atlas-gridfs-smoke.mjs",
  "utf8"
);
const indexContract = await readFile(
  "scripts/production/atlas-index-contract.mjs",
  "utf8"
);

const requirePattern = (
  pattern,
  message
) => {
  if (!pattern.test(smoke)) {
    throw new Error(message);
  }
};

requirePattern(
  /assertProductionEnvironment/,
  "Atlas smoke must run production preflight first"
);
requirePattern(
  /topology:\s*"in-process"/,
  "Atlas smoke must use the real Kairoseth in-process topology"
);
requirePattern(
  /MongoStore\.open/,
  "Atlas smoke must initialize the real metadata adapter"
);
requirePattern(
  /GridFsArtifactStore\.open/,
  "Atlas smoke must initialize the real GridFS adapter"
);
requirePattern(
  /verifyAtlasIndexContract/,
  "Atlas smoke must verify the live index contract"
);
requirePattern(
  /metadataIndexesVerified/,
  "Atlas smoke must expose verified metadata-index evidence"
);
requirePattern(
  /gridFsIndexesVerified/,
  "Atlas smoke must expose verified GridFS-index evidence"
);
requirePattern(
  /withTransaction/,
  "Atlas smoke must validate a real MongoDB transaction"
);
requirePattern(
  /ROLLBACK_SENTINEL/,
  "Transaction smoke must intentionally rollback"
);
requirePattern(
  /leakedTransactionRecord/,
  "Transaction smoke must verify rollback left no record"
);
requirePattern(
  /artifactStore\.save/,
  "GridFS smoke must upload an artifact"
);
requirePattern(
  /artifactStore\.read/,
  "GridFS smoke must download the artifact"
);
requirePattern(
  /sha256\(restored\)/,
  "GridFS smoke must verify SHA-256 integrity"
);
requirePattern(
  /artifactStore\.remove/,
  "GridFS smoke must clean up the artifact"
);
requirePattern(
  /status:\s*"ok"/,
  "Atlas smoke must emit a machine-readable success result"
);

for (const [pattern, message] of [
  [
    /listIndexes\(\)/,
    "Atlas index contract must inspect indexes from the live database"
  ],
  [
    /ATLAS_INDEX_MISSING/,
    "Atlas index contract must fail closed on missing indexes"
  ],
  [
    /ATLAS_INDEX_KEY_MISMATCH/,
    "Atlas index contract must fail closed on key drift"
  ],
  [
    /ATLAS_INDEX_UNIQUENESS_MISMATCH/,
    "Atlas index contract must fail closed on uniqueness drift"
  ]
]) {
  if (!pattern.test(indexContract)) {
    throw new Error(message);
  }
}

if (
  /process\.stdout\.write[\s\S]*(?:MONGODB_URI|KAIROSETH_SERVICE_SECRET)/.test(
    smoke
  )
) {
  throw new Error(
    "Atlas smoke must never print secrets"
  );
}

console.log(
  "Atlas/GridFS smoke contract OK (in-process preflight, live index contract, rollback, round-trip integrity, cleanup, sanitized output)"
);
