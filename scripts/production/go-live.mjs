import {
  spawnSync
} from "node:child_process";

const npmCommand =
  process.platform === "win32"
    ? "npm.cmd"
    : "npm";

const automatedSteps = [
  {
    id: "production-preflight",
    script:
      "production:preflight"
  },
  {
    id: "atlas-gridfs",
    script:
      "production:atlas-smoke"
  },
  {
    id: "kairoseth-health",
    script:
      "production:kairoseth-health-smoke"
  },
  {
    id: "public-pdf",
    script:
      "production:public-pdf-smoke"
  }
];

const manualGatesRemaining = [
  "woocommerce-live-store-smoke",
  "prestashop-1.7.8-and-8.x-smoke",
  "backup-restore-drill",
  "edge-volumetric-protection",
  "live-infrastructure-security-review",
  "focused-external-penetration-test"
];

const parseJson = (
  source,
  step
) => {
  try {
    return JSON.parse(
      source.trim()
    );
  } catch {
    const error = new Error(
      `Step ${step} did not return valid JSON`
    );
    error.code =
      "GO_LIVE_INVALID_STEP_OUTPUT";
    throw error;
  }
};

const runScript = (
  script,
  id
) => {
  const result = spawnSync(
    npmCommand,
    [
      "run",
      "--silent",
      script
    ],
    {
      encoding: "utf8",
      env: process.env,
      maxBuffer:
        4 * 1024 * 1024
    }
  );

  if (result.status !== 0) {
    const error = new Error(
      `Go-live step failed: ${id}`
    );
    error.code =
      "GO_LIVE_STEP_FAILED";
    error.step = id;
    error.exitCode =
      result.status;
    throw error;
  }

  return parseJson(
    result.stdout,
    id
  );
};

const requireEnvironment =
  () => {
    const errors = [];

    if (
      process.env.NODE_ENV !==
      "production"
    ) {
      errors.push(
        "NODE_ENV must be production"
      );
    }

    if (
      typeof process.env.OPERATIONS_HEALTH_SECRET !==
        "string" ||
      process.env
        .OPERATIONS_HEALTH_SECRET
        .trim().length < 32
    ) {
      errors.push(
        "OPERATIONS_HEALTH_SECRET must contain at least 32 characters"
      );
    }

    if (
      !/^https:\/\/kairoseth\.com\/deca\/d\/[A-Za-z0-9_-]{16,128}\.pdf$/.test(
        process.env
          .DECA_SMOKE_PUBLIC_URL ??
          ""
      )
    ) {
      errors.push(
        "DECA_SMOKE_PUBLIC_URL must be a canonical kairoseth.com DeCA PDF URL"
      );
    }

    if (
      !/^sha256:[a-f0-9]{64}$/.test(
        process.env
          .DECA_SMOKE_EXPECTED_SHA256 ??
          ""
      )
    ) {
      errors.push(
        "DECA_SMOKE_EXPECTED_SHA256 must be an immutable sha256:<hex> value"
      );
    }

    if (errors.length > 0) {
      const error = new Error(
        "Go-live environment is incomplete"
      );
      error.code =
        "GO_LIVE_ENVIRONMENT_INVALID";
      error.validationErrors =
        errors;
      throw error;
    }
  };

const reconciliationAnomalyKeys = [
  "missingBeforeRetention",
  "missingAfterRetention",
  "orphanedArtifacts",
  "purgedArtifactsStillPresent"
];

const main = () => {
  requireEnvironment();

  const results = [];

  for (
    const step of
    automatedSteps
  ) {
    const output = runScript(
      step.script,
      step.id
    );

    results.push({
      step: step.id,
      status: "ok",
      check:
        output?.check ??
        output?.status ??
        "ok"
    });
  }

  const reconciliation =
    runScript(
      "artifacts:reconcile",
      "artifact-reconciliation"
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
      "GO_LIVE_RECONCILIATION_INVALID";
    throw error;
  }

  const anomalies =
    Object.fromEntries(
      reconciliationAnomalyKeys
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
      "Artifact reconciliation contains go-live blockers"
    );
    error.code =
      "GO_LIVE_RECONCILIATION_BLOCKED";
    error.anomalies =
      anomalies;
    throw error;
  }

  results.push({
    step:
      "artifact-reconciliation",
    status: "ok",
    counts: {
      references:
        Number(
          counts.references ?? 0
        ),
      storedArtifacts:
        Number(
          counts.storedArtifacts ??
            0
        ),
      purgeRecords:
        Number(
          counts.purgeRecords ?? 0
        ),
      missingBeforeRetention: 0,
      missingAfterRetention: 0,
      orphanedArtifacts: 0,
      purgedArtifactsStillPresent: 0
    }
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          "puente-deca-go-live",
        scope:
          "automated-core-acceptance",
        automatedSteps:
          results,
        manualGatesRemaining,
        productionReady:
          manualGatesRemaining
            .length === 0
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
        "puente-deca-go-live",
      code:
        typeof error?.code ===
          "string"
          ? error.code
          : "GO_LIVE_FAILED",
      step:
        typeof error?.step ===
          "string"
          ? error.step
          : null,
      validationErrors:
        Array.isArray(
          error?.validationErrors
        )
          ? error.validationErrors
          : undefined,
      anomalies:
        error?.anomalies &&
        typeof error.anomalies ===
          "object"
          ? error.anomalies
          : undefined
    })}\n`
  );

  process.exitCode = 1;
}
