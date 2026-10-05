import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

const connectorArg = process.argv.find((value) =>
  value.startsWith("--connector="),
);
const connector = connectorArg?.slice("--connector=".length) ?? "";

const configs = {
  woocommerce: {
    script: "scripts/production/woocommerce-live-store-smoke.php",
    check: "woocommerce-live-store-smoke",
    rootEnv: "PDECA_WP_ROOT",
    orderEnv: "PDECA_WOO_SMOKE_ORDER_ID",
  },
  prestashop: {
    script: "scripts/production/prestashop-live-store-smoke.php",
    check: "prestashop-live-store-smoke",
    rootEnv: "PDECA_PRESTASHOP_ROOT",
    orderEnv: "PDECA_PRESTASHOP_SMOKE_ORDER_ID",
  },
};

const fail = (code, message) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check: "connector-live-store-acceptance",
      code,
      message,
    })}\n`,
  );
  process.exitCode = 1;
};

try {
  const config = configs[connector];
  if (!config) {
    throw Object.assign(
      new Error("Use --connector=woocommerce or --connector=prestashop"),
      { code: "INVALID_CONNECTOR" },
    );
  }

  if (!(process.env[config.rootEnv]?.trim())) {
    throw Object.assign(
      new Error(`${config.rootEnv} is required`),
      { code: "STORE_ROOT_REQUIRED" },
    );
  }

  const smoke = spawnSync("php", [config.script], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 1_000_000,
  });

  if (smoke.error?.code === "ENOENT") {
    throw Object.assign(
      new Error("PHP is required on the store host"),
      { code: "PHP_NOT_FOUND" },
    );
  }
  if (smoke.status !== 0) {
    let upstreamCode = "CONNECTOR_LIVE_SMOKE_FAILED";
    try {
      const parsed = JSON.parse((smoke.stderr || "").trim());
      if (typeof parsed?.code === "string" && parsed.code) {
        upstreamCode = parsed.code;
      }
    } catch {
      // Deliberately do not echo raw stderr because it belongs to the store runtime.
    }
    throw Object.assign(
      new Error("Connector live-store smoke did not pass"),
      { code: upstreamCode },
    );
  }

  const stdout = (smoke.stdout || "").trim();
  let result;
  try {
    result = JSON.parse(stdout);
  } catch {
    throw Object.assign(
      new Error("Connector live-store smoke returned invalid JSON"),
      { code: "INVALID_SMOKE_OUTPUT" },
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
      new Error("Connector live-store smoke result is not acceptable"),
      { code: "SMOKE_RESULT_NOT_GREEN" },
    );
  }

  const orderRequested = Boolean(process.env[config.orderEnv]?.trim());
  if (orderRequested) {
    const mapping = result?.orderMapping;
    if (
      mapping?.requested !== true ||
      mapping?.mapped !== true ||
      mapping?.requiredFactsPresent !== true ||
      !Array.isArray(mapping?.missingFacts) ||
      mapping.missingFacts.length !== 0
    ) {
      throw Object.assign(
        new Error("Existing-order mapping acceptance is incomplete"),
        { code: "ORDER_MAPPING_NOT_READY" },
      );
    }
  }

  const git = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  });
  const commit = (git.stdout || "").trim();
  if (git.status !== 0 || !/^[a-f0-9]{40}$/.test(commit)) {
    throw Object.assign(
      new Error("A git checkout with an identifiable commit is required"),
      { code: "SOURCE_COMMIT_UNAVAILABLE" },
    );
  }

  const evidence = {
    schemaVersion: 1,
    check: "puente-deca-connector-live-store-acceptance",
    connector,
    repository: "Emmakex/puente-deca",
    commit,
    recordedAt: new Date().toISOString(),
    readOnly: true,
    orderMappingRequired: orderRequested,
    result,
  };

  const output = `.artifacts/connector-live/${connector}-acceptance-evidence.json`;
  const checksum = `${output}.sha256`;
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  const digest = createHash("sha256").update(serialized).digest("hex");

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serialized, { encoding: "utf8", mode: 0o600 });
  await writeFile(checksum, `${digest}  ${output}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(output, 0o600);
  await chmod(checksum, 0o600);

  process.stdout.write(
    `${JSON.stringify({
      status: "ok",
      check: "connector-live-store-acceptance",
      connector,
      commit,
      orderMappingRequired: orderRequested,
      evidenceFile: output,
      checksumFile: checksum,
    })}\n`,
  );
} catch (error) {
  fail(
    typeof error?.code === "string"
      ? error.code
      : "CONNECTOR_LIVE_ACCEPTANCE_FAILED",
    error instanceof Error ? error.message : "Unknown error",
  );
}
