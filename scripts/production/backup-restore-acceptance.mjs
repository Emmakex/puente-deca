import {
  randomUUID
} from "node:crypto";
import {
  spawnSync
} from "node:child_process";

const requireText = (
  value,
  name
) => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    const error = new Error(
      `${name} is required`
    );
    error.code =
      "DR_ACCEPTANCE_CONFIGURATION_INVALID";
    throw error;
  }

  return value.trim();
};

const runNodeJson = (
  script,
  env
) => {
  const result = spawnSync(
    process.execPath,
    [script],
    {
      encoding: "utf8",
      env,
      maxBuffer:
        16 * 1024 * 1024
    }
  );

  if (result.status !== 0) {
    const error = new Error(
      `${script} failed`
    );
    error.code =
      "DR_ACCEPTANCE_CHILD_FAILED";
    error.childStatus =
      result.status;
    throw error;
  }

  try {
    return JSON.parse(
      result.stdout.trim()
    );
  } catch {
    const error = new Error(
      `${script} returned invalid JSON`
    );
    error.code =
      "DR_ACCEPTANCE_CHILD_OUTPUT_INVALID";
    throw error;
  }
};

const main = () => {
  requireText(
    process.env.MONGODB_URI,
    "MONGODB_URI"
  );
  requireText(
    process.env
      .RESTORE_MONGODB_URI,
    "RESTORE_MONGODB_URI"
  );

  const generatedRestoreDatabase =
    `kairoseth_deca_dr_${Date.now()}_${randomUUID()
      .replaceAll("-", "")
      .slice(0, 12)}`;

  const restoreDatabase =
    (
      process.env.RESTORE_DB_NAME ??
      generatedRestoreDatabase
    ).trim();

  const backup = runNodeJson(
    "scripts/production/backup-deca.mjs",
    process.env
  );

  const restore = runNodeJson(
    "scripts/production/restore-drill.mjs",
    {
      ...process.env,
      RESTORE_DB_NAME:
        restoreDatabase,
      BACKUP_ARCHIVE:
        backup.archive,
      BACKUP_EXPECTED_SHA256:
        backup.sha256
    }
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          "puente-deca-backup-restore-acceptance",
        backup: {
          bytes:
            backup.bytes,
          sha256:
            backup.sha256,
          namespaces:
            backup.namespaces,
          sourceCollectionSetSha256:
            backup
              .sourceCollectionSetSha256
        },
        restore: {
          database:
            restore.restoreDatabase,
          allArtifactsVerified:
            restore.allArtifactsVerified,
          artifactsVerified:
            restore.artifactsVerified,
          artifactBytesVerified:
            restore.artifactBytesVerified,
          metadataArtifactLinksVerified:
            restore.metadataArtifactLinksVerified,
          reconciliation:
            restore.reconciliation,
          cleanedUp:
            restore.restoreDatabaseCleanedUp,
          preserved:
            restore.restoreDatabasePreserved
        }
      },
      null,
      2
    )}\n`
  );
};

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check:
        "puente-deca-backup-restore-acceptance",
      code:
        typeof error?.code ===
          "string"
          ? error.code
          : "DR_ACCEPTANCE_FAILED",
      childStatus:
        Number.isInteger(
          error?.childStatus
        )
          ? error.childStatus
          : undefined
    })}\n`
  );

  process.exitCode = 1;
}
