import {
  spawnSync
} from "node:child_process";
import {
  resolve
} from "node:path";
import {
  fileURLToPath
} from "node:url";

const packageRoot =
  fileURLToPath(
    new URL("../../", import.meta.url)
  );

const scriptPaths = {
  preflight:
    fileURLToPath(
      new URL(
        "./preflight.mjs",
        import.meta.url
      )
    ),
  atlasGridFs:
    fileURLToPath(
      new URL(
        "./atlas-gridfs-smoke.mjs",
        import.meta.url
      )
    ),
  atlasConcurrency:
    fileURLToPath(
      new URL(
        "./atlas-concurrency-smoke.mjs",
        import.meta.url
      )
    ),
  reconciliation:
    fileURLToPath(
      new URL(
        "../retention/retention-cli.mjs",
        import.meta.url
      )
    )
};

const parseSafeChildFailure = (stderr) => {
  const lines = String(stderr ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const code =
        typeof parsed?.code === "string" &&
        /^[A-Z0-9_]{1,100}$/.test(parsed.code)
          ? parsed.code
          : null;
      const errorClass =
        typeof parsed?.errorClass === "string" &&
        /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(parsed.errorClass)
          ? parsed.errorClass
          : null;

      if (parsed?.status === "error" && code) {
        return {
          causeCode: code,
          causeClass: errorClass
        };
      }
    } catch {
      // Ignore non-JSON runtime warnings.
    }
  }

  return {
    causeCode: null,
    causeClass: null
  };
};

const runNodeScript = (
  scriptPath,
  id,
  scriptArgs = []
) => {
  const result = spawnSync(
    process.execPath,
    [scriptPath, ...scriptArgs],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: process.env,
      maxBuffer:
        4 * 1024 * 1024
    }
  );

  if (result.status !== 0) {
    const childFailure =
      parseSafeChildFailure(result.stderr);
    const error = new Error(
      `Atlas core acceptance step failed: ${id}`
    );
    error.code =
      "ATLAS_CORE_STEP_FAILED";
    error.step = id;
    error.causeCode =
      childFailure.causeCode;
    error.causeClass =
      childFailure.causeClass;
    throw error;
  }

  try {
    return JSON.parse(
      result.stdout.trim()
    );
  } catch {
    const error = new Error(
      `Atlas core acceptance step did not return valid JSON: ${id}`
    );
    error.code =
      "ATLAS_CORE_INVALID_OUTPUT";
    error.step = id;
    throw error;
  }
};

const anomalyKeys = [
  "missingBeforeRetention",
  "missingAfterRetention",
  "orphanedArtifacts",
  "purgedArtifactsStillPresent"
];

export const runAtlasCoreAcceptance = () => {
  const preflight =
    runNodeScript(
      scriptPaths.preflight,
      "production-preflight",
      ["--topology=in-process"]
    );

  if (
    preflight?.valid !== true ||
    preflight?.target?.topology !== "in-process"
  ) {
    const error = new Error(
      "Production preflight is not valid for in-process topology"
    );
    error.code =
      "ATLAS_CORE_PREFLIGHT_INVALID";
    error.step =
      "production-preflight";
    throw error;
  }

  const atlasGridFs =
    runNodeScript(
      scriptPaths.atlasGridFs,
      "atlas-gridfs"
    );

  if (
    atlasGridFs?.status !== "ok" ||
    atlasGridFs?.check !==
      "atlas-gridfs-smoke"
  ) {
    const error = new Error(
      "Atlas/GridFS smoke is not green"
    );
    error.code =
      "ATLAS_CORE_GRIDFS_INVALID";
    error.step = "atlas-gridfs";
    throw error;
  }

  const atlasConcurrency =
    runNodeScript(
      scriptPaths.atlasConcurrency,
      "atlas-concurrency"
    );

  if (
    atlasConcurrency?.status !== "ok" ||
    atlasConcurrency?.check !==
      "atlas-concurrency-smoke" ||
    atlasConcurrency?.scope !==
      "deca-only"
  ) {
    const error = new Error(
      "DeCA Atlas concurrency smoke is not green"
    );
    error.code =
      "ATLAS_CORE_CONCURRENCY_INVALID";
    error.step =
      "atlas-concurrency";
    throw error;
  }

  const reconciliation =
    runNodeScript(
      scriptPaths.reconciliation,
      "artifact-reconciliation",
      ["reconcile"]
    );

  const counts =
    reconciliation?.counts;

  if (
    !counts ||
    typeof counts !== "object"
  ) {
    const error = new Error(
      "Artifact reconciliation did not return counts"
    );
    error.code =
      "ATLAS_CORE_RECONCILIATION_INVALID";
    error.step =
      "artifact-reconciliation";
    throw error;
  }

  const anomalies =
    Object.fromEntries(
      anomalyKeys
        .map((key) => [
          key,
          Number(counts[key] ?? 0)
        ])
        .filter(
          ([, value]) =>
            !Number.isFinite(value) ||
            value !== 0
        )
    );

  if (
    Object.keys(anomalies)
      .length > 0
  ) {
    const error = new Error(
      "Artifact reconciliation contains Atlas core blockers"
    );
    error.code =
      "ATLAS_CORE_RECONCILIATION_BLOCKED";
    error.step =
      "artifact-reconciliation";
    error.anomalies = anomalies;
    throw error;
  }

  return {
    status: "ok",
    check:
      "deca-atlas-core-acceptance",
    scope: "deca-only",
    database:
      atlasGridFs.database,
    artifactBucket:
      atlasGridFs.artifactBucket,
    steps: {
      preflight: true,
      atlasGridFs: true,
      atlasConcurrency: true,
      artifactReconciliation: true
    },
    evidence: {
      metadataPing:
        atlasGridFs.metadataPing === true,
      artifactPing:
        atlasGridFs.artifactPing === true,
      indexContract:
        atlasGridFs.indexContract === true,
      transactionRollback:
        atlasGridFs.transactionRollback === true,
      gridfsRoundTrip:
        atlasGridFs.gridfsRoundTrip === true,
      gridfsCleanup:
        atlasGridFs.gridfsCleanup === true,
      idempotencyConcurrency:
        atlasConcurrency.idempotencyConcurrency === true,
      idempotencyConverged:
        atlasConcurrency.idempotencyConverged === true,
      documentVersionConcurrency:
        atlasConcurrency.documentVersionConcurrency === true,
      documentLineageConsistent:
        atlasConcurrency.documentLineageConsistent === true,
      cleanupVerified:
        atlasConcurrency.cleanupVerified === true
    },
    reconciliation: {
      references:
        Number(counts.references ?? 0),
      storedArtifacts:
        Number(counts.storedArtifacts ?? 0),
      purgeRecords:
        Number(counts.purgeRecords ?? 0),
      missingBeforeRetention: 0,
      missingAfterRetention: 0,
      orphanedArtifacts: 0,
      purgedArtifactsStillPresent: 0
    }
  };
};

const isDirectExecution =
  process.argv[1] &&
  resolve(process.argv[1]) ===
    resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  try {
    const result =
      runAtlasCoreAcceptance();
    process.stdout.write(
      `${JSON.stringify(
        result,
        null,
        2
      )}\n`
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        check:
          "deca-atlas-core-acceptance",
        code:
          typeof error?.code === "string"
            ? error.code
            : "ATLAS_CORE_ACCEPTANCE_FAILED",
        step:
          typeof error?.step === "string"
            ? error.step
            : null,
        causeCode:
          typeof error?.causeCode === "string"
            ? error.causeCode
            : undefined,
        causeClass:
          typeof error?.causeClass === "string"
            ? error.causeClass
            : undefined,
        anomalies:
          error?.anomalies &&
          typeof error.anomalies === "object"
            ? error.anomalies
            : undefined
      })}\n`
    );
    process.exitCode = 1;
  }
}
