import {
  createHash,
  randomUUID
} from "node:crypto";
import {
  chmod,
  mkdir,
  writeFile
} from "node:fs/promises";
import {
  dirname
} from "node:path";
import {
  spawnSync
} from "node:child_process";

const connectorArg = process.argv.find(
  (value) =>
    value.startsWith(
      "--connector="
    )
);
const connector =
  connectorArg?.slice(
    "--connector=".length
  ) ?? "";
const completionGate =
  process.argv.includes(
    "--completion-gate"
  );

const configs = {
  woocommerce: {
    script:
      "scripts/production/woocommerce-live-store-smoke.php",
    check:
      "woocommerce-live-store-smoke",
    rootEnv:
      "PDECA_WP_ROOT",
    orderEnv:
      "PDECA_WOO_SMOKE_ORDER_ID"
  },
  prestashop: {
    script:
      "scripts/production/prestashop-live-store-smoke.php",
    check:
      "prestashop-live-store-smoke",
    rootEnv:
      "PDECA_PRESTASHOP_ROOT",
    orderEnv:
      "PDECA_PRESTASHOP_SMOKE_ORDER_ID"
  }
};

const fail = (
  code,
  message
) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check:
        "connector-live-store-acceptance",
      code,
      message
    })}\n`
  );
  process.exitCode = 1;
};

const requireCompletionText = (
  value,
  code,
  message
) => {
  const normalized =
    String(value ?? "").trim();

  if (!normalized) {
    throw Object.assign(
      new Error(message),
      { code }
    );
  }

  return normalized;
};

const resolvePlatformVariant = (
  selectedConnector,
  result
) => {
  if (
    selectedConnector ===
    "woocommerce"
  ) {
    return "woocommerce";
  }

  const version =
    String(
      result?.prestashopVersion ??
      ""
    ).trim();

  if (
    /^1\.7\.8(?:\.|$)/.test(
      version
    )
  ) {
    return "prestashop-1.7.8.x";
  }

  if (/^8\./.test(version)) {
    return "prestashop-8.x";
  }

  return "prestashop-other";
};

try {
  const config =
    configs[connector];

  if (!config) {
    throw Object.assign(
      new Error(
        "Use --connector=woocommerce or --connector=prestashop"
      ),
      {
        code:
          "INVALID_CONNECTOR"
      }
    );
  }

  if (
    !(
      process.env[
        config.rootEnv
      ]?.trim()
    )
  ) {
    throw Object.assign(
      new Error(
        `${config.rootEnv} is required`
      ),
      {
        code:
          "STORE_ROOT_REQUIRED"
      }
    );
  }

  let expectedConnectorVersion =
    null;
  let dataClass = null;
  let environmentClass = null;

  if (completionGate) {
    if (
      !process.env[
        config.orderEnv
      ]?.trim()
    ) {
      throw Object.assign(
        new Error(
          "A Kairoseth-controlled synthetic smoke order is required for completion acceptance"
        ),
        {
          code:
            "COMPLETION_ORDER_REQUIRED"
        }
      );
    }

    dataClass =
      requireCompletionText(
        process.env
          .PDECA_ACCEPTANCE_DATA_CLASS,
        "ACCEPTANCE_DATA_CLASS_REQUIRED",
        "PDECA_ACCEPTANCE_DATA_CLASS=synthetic is required for completion acceptance"
      ).toLowerCase();

    if (dataClass !== "synthetic") {
      throw Object.assign(
        new Error(
          "Completion acceptance must use synthetic data"
        ),
        {
          code:
            "ACCEPTANCE_DATA_CLASS_INVALID"
        }
      );
    }

    environmentClass =
      requireCompletionText(
        process.env
          .PDECA_ACCEPTANCE_ENVIRONMENT,
        "ACCEPTANCE_ENVIRONMENT_REQUIRED",
        "PDECA_ACCEPTANCE_ENVIRONMENT=kairoseth-controlled is required for completion acceptance"
      ).toLowerCase();

    if (
      environmentClass !==
      "kairoseth-controlled"
    ) {
      throw Object.assign(
        new Error(
          "Completion acceptance must run on a Kairoseth-controlled store"
        ),
        {
          code:
            "ACCEPTANCE_ENVIRONMENT_INVALID"
        }
      );
    }

    expectedConnectorVersion =
      requireCompletionText(
        process.env
          .PDECA_EXPECTED_CONNECTOR_VERSION,
        "EXPECTED_CONNECTOR_VERSION_REQUIRED",
        "PDECA_EXPECTED_CONNECTOR_VERSION is required for completion acceptance"
      );
  }

  const smoke = spawnSync(
    "php",
    [config.script],
    {
      encoding: "utf8",
      env: process.env,
      maxBuffer: 1_000_000
    }
  );

  if (
    smoke.error?.code ===
    "ENOENT"
  ) {
    throw Object.assign(
      new Error(
        "PHP is required on the store host"
      ),
      {
        code:
          "PHP_NOT_FOUND"
      }
    );
  }

  if (smoke.status !== 0) {
    let upstreamCode =
      "CONNECTOR_LIVE_SMOKE_FAILED";

    try {
      const parsed = JSON.parse(
        (smoke.stderr || "").trim()
      );

      if (
        typeof parsed?.code ===
          "string" &&
        parsed.code
      ) {
        upstreamCode = parsed.code;
      }
    } catch {
      // Never echo raw store-runtime stderr.
    }

    throw Object.assign(
      new Error(
        "Connector live-store smoke did not pass"
      ),
      {
        code: upstreamCode
      }
    );
  }

  const stdout =
    (smoke.stdout || "").trim();
  let result;

  try {
    result = JSON.parse(stdout);
  } catch {
    throw Object.assign(
      new Error(
        "Connector live-store smoke returned invalid JSON"
      ),
      {
        code:
          "INVALID_SMOKE_OUTPUT"
      }
    );
  }

  if (
    result?.status !== "ok" ||
    result?.check !== config.check ||
    result?.readOnly !== true ||
    result?.endpointHttps !== true ||
    result?.credentialConfigured !== true ||
    result?.cargoReadCheck !== true
  ) {
    throw Object.assign(
      new Error(
        "Connector live-store smoke result is not acceptable"
      ),
      {
        code:
          "SMOKE_RESULT_NOT_GREEN"
      }
    );
  }

  const orderRequested = Boolean(
    process.env[
      config.orderEnv
    ]?.trim()
  );

  if (orderRequested) {
    const mapping =
      result?.orderMapping;

    if (
      mapping?.requested !== true ||
      mapping?.mapped !== true ||
      mapping
        ?.requiredFactsPresent !==
        true ||
      !Array.isArray(
        mapping?.missingFacts
      ) ||
      mapping.missingFacts.length !==
        0
    ) {
      throw Object.assign(
        new Error(
          "Existing-order mapping acceptance is incomplete"
        ),
        {
          code:
            "ORDER_MAPPING_NOT_READY"
        }
      );
    }
  }

  if (
    completionGate &&
    !orderRequested
  ) {
    throw Object.assign(
      new Error(
        "Completion acceptance requires mapped synthetic order evidence"
      ),
      {
        code:
          "COMPLETION_MAPPING_REQUIRED"
      }
    );
  }

  if (
    completionGate &&
    result?.connectorVersion !==
      expectedConnectorVersion
  ) {
    throw Object.assign(
      new Error(
        "Installed connector version does not match the expected accepted release"
      ),
      {
        code:
          "CONNECTOR_VERSION_MISMATCH"
      }
    );
  }

  const platformVariant =
    resolvePlatformVariant(
      connector,
      result
    );

  if (
    completionGate &&
    connector === "prestashop" &&
    ![
      "prestashop-1.7.8.x",
      "prestashop-8.x"
    ].includes(
      platformVariant
    )
  ) {
    throw Object.assign(
      new Error(
        "PrestaShop completion evidence must come from the declared 1.7.8.x or 8.x acceptance line"
      ),
      {
        code:
          "PRESTASHOP_COMPLETION_LINE_UNSUPPORTED"
      }
    );
  }

  const git = spawnSync(
    "git",
    ["rev-parse", "HEAD"],
    {
      encoding: "utf8"
    }
  );
  const commit =
    (git.stdout || "").trim();

  if (
    git.status !== 0 ||
    !/^[a-f0-9]{40}$/.test(
      commit
    )
  ) {
    throw Object.assign(
      new Error(
        "A git checkout with an identifiable commit is required"
      ),
      {
        code:
          "SOURCE_COMMIT_UNAVAILABLE"
      }
    );
  }

  const completionEligible =
    completionGate &&
    orderRequested &&
    dataClass === "synthetic" &&
    environmentClass ===
      "kairoseth-controlled" &&
    result?.connectorVersion ===
      expectedConnectorVersion;

  const evidence = {
    schemaVersion: 2,
    evidenceId:
      `connector-live-${randomUUID()}`,
    check:
      "puente-deca-connector-live-store-acceptance",
    connector,
    platformVariant,
    repository:
      "Emmakex/puente-deca",
    commit,
    recordedAt:
      new Date().toISOString(),
    readOnly: true,
    completionGate,
    completionEligible,
    dataClass,
    environmentClass,
    expectedConnectorVersion,
    orderMappingRequired:
      completionGate ||
      orderRequested,
    result
  };

  const output =
    `.artifacts/connector-live/${connector}-acceptance-evidence.json`;
  const checksum =
    `${output}.sha256`;
  const serialized =
    `${JSON.stringify(
      evidence,
      null,
      2
    )}\n`;
  const digest =
    createHash("sha256")
      .update(serialized)
      .digest("hex");

  await mkdir(
    dirname(output),
    { recursive: true }
  );
  await writeFile(
    output,
    serialized,
    {
      encoding: "utf8",
      mode: 0o600
    }
  );
  await writeFile(
    checksum,
    `${digest}  ${output}\n`,
    {
      encoding: "utf8",
      mode: 0o600
    }
  );
  await chmod(output, 0o600);
  await chmod(checksum, 0o600);

  process.stdout.write(
    `${JSON.stringify({
      status: "ok",
      check:
        "connector-live-store-acceptance",
      connector,
      platformVariant,
      commit,
      completionGate,
      completionEligible,
      evidenceId:
        evidence.evidenceId,
      evidenceSha256:
        `sha256:${digest}`,
      orderMappingRequired:
        evidence
          .orderMappingRequired,
      evidenceFile: output,
      checksumFile: checksum
    })}\n`
  );
} catch (error) {
  fail(
    typeof error?.code ===
      "string"
      ? error.code
      : "CONNECTOR_LIVE_ACCEPTANCE_FAILED",
    error instanceof Error
      ? error.message
      : "Unknown error"
  );
}
