import { readFile } from "node:fs/promises";

const retention = await readFile(
  "packages/persistence/src/retention.mjs",
  "utf8"
);
const mongo = await readFile(
  "packages/persistence/src/mongo-store.mjs",
  "utf8"
);
const json = await readFile(
  "packages/persistence/src/json-store.mjs",
  "utf8"
);
const cli = await readFile(
  "scripts/retention/retention-cli.mjs",
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
  retention,
  /confirm\s*=\s*false/,
  "Retention purge must default to dry-run"
);
requirePattern(
  retention,
  /artifactStore\.remove/,
  "Retention purge must remove only the binary artifact"
);
requirePattern(
  retention,
  /recordArtifactPurge/,
  "Retention purge must write a separate purge record"
);
requirePattern(
  retention,
  /missingBeforeRetention/,
  "Reconciliation must detect premature artifact loss"
);
requirePattern(
  retention,
  /orphanedArtifacts/,
  "Reconciliation must detect orphan artifacts"
);
requirePattern(
  cli,
  /PURGE_ELIGIBLE_DECA_PDFS/,
  "Destructive purge must require an explicit confirmation phrase"
);
requirePattern(
  mongo,
  /deca_artifact_purges/,
  "MongoDB must keep separate artifact purge evidence"
);
requirePattern(
  mongo,
  /artifact_purge_document_unique/,
  "Purge evidence must be unique by document"
);
requirePattern(
  json,
  /ARTIFACT_RETENTION_ACTIVE/,
  "Development store must enforce the retention floor too"
);

for (const source of [retention, cli]) {
  if (
    /deleteOne\([^)]*deca_document_versions|deleteMany\([^)]*deca_document_versions/.test(
      source
    )
  ) {
    throw new Error(
      "Retention tooling must never delete immutable document-version metadata"
    );
  }
}

console.log(
  "Retention contract OK (dry-run default, explicit purge confirmation, immutable metadata, reconciliation)"
);
