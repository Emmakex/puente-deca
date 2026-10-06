import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyAtlasRuntimeSecurityEvidence } from "./atlas-runtime-security-evidence-verify.mjs";
import { verifyDeployedTenantIsolationEvidence } from "./deployed-tenant-isolation-evidence-verify.mjs";
import { verifyDeploymentReadinessRollbackEvidence } from "./deployment-readiness-rollback-evidence-verify.mjs";
import { verifyHostingerWafConfigurationEvidence } from "./hostinger-waf-configuration-evidence-verify.mjs";
import { validateInfrastructureSecurityAcceptance } from "./infrastructure-security-acceptance.mjs";

const REQUIRED_CONTROLS = [
  "atlasLeastPrivilege",
  "atlasNetworkAccess",
  "runtimeSecretScope",
  "deployedTenantIsolation",
  "deploymentReadinessRollback",
  "hostingerWafConfiguration",
];

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("INFRA_SECURITY_COMPOSE_SHAPE_INVALID", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    !actual.every((key, index) => key === wanted[index])
  ) {
    fail(
      "INFRA_SECURITY_COMPOSE_SHAPE_INVALID",
      `${label} keys must be exactly: ${wanted.join(", ")}`,
    );
  }
};

const assertControl = (name, value) => {
  exactKeys(
    value,
    ["status", "evidenceSha256", "referenceId", "recordedAt"],
    name,
  );
  if (value.status !== "pass") {
    fail("INFRA_SECURITY_COMPOSE_CONTROL_INVALID", `${name} is not pass`);
  }
  return { ...value };
};

const assertSingleVerifier = (result, expectedCheck, expectedControl) => {
  exactKeys(
    result,
    ["status", "check", "controlName", "source", "control"],
    expectedControl,
  );
  if (
    result.status !== "ok" ||
    result.check !== expectedCheck ||
    result.controlName !== expectedControl
  ) {
    fail(
      "INFRA_SECURITY_COMPOSE_SOURCE_INVALID",
      `${expectedControl} verifier result is not canonical`,
    );
  }
  return assertControl(expectedControl, result.control);
};

export const composeInfrastructureSecurityAcceptance = ({
  atlasRuntimeResult,
  tenantIsolationResult,
  rollbackResult,
  hostingerWafResult,
}) => {
  exactKeys(
    atlasRuntimeResult,
    ["status", "check", "source", "controls"],
    "atlas runtime verifier result",
  );
  if (
    atlasRuntimeResult.status !== "ok" ||
    atlasRuntimeResult.check !== "atlas-runtime-security-evidence-verify"
  ) {
    fail(
      "INFRA_SECURITY_COMPOSE_SOURCE_INVALID",
      "Atlas/runtime verifier result is not canonical",
    );
  }
  exactKeys(
    atlasRuntimeResult.controls,
    ["atlasLeastPrivilege", "atlasNetworkAccess", "runtimeSecretScope"],
    "atlas runtime controls",
  );

  const controls = {
    atlasLeastPrivilege: assertControl(
      "atlasLeastPrivilege",
      atlasRuntimeResult.controls.atlasLeastPrivilege,
    ),
    atlasNetworkAccess: assertControl(
      "atlasNetworkAccess",
      atlasRuntimeResult.controls.atlasNetworkAccess,
    ),
    runtimeSecretScope: assertControl(
      "runtimeSecretScope",
      atlasRuntimeResult.controls.runtimeSecretScope,
    ),
    deployedTenantIsolation: assertSingleVerifier(
      tenantIsolationResult,
      "deployed-tenant-isolation-evidence-verify",
      "deployedTenantIsolation",
    ),
    deploymentReadinessRollback: assertSingleVerifier(
      rollbackResult,
      "deployment-readiness-rollback-evidence-verify",
      "deploymentReadinessRollback",
    ),
    hostingerWafConfiguration: assertSingleVerifier(
      hostingerWafResult,
      "hostinger-waf-configuration-evidence-verify",
      "hostingerWafConfiguration",
    ),
  };

  exactKeys(controls, REQUIRED_CONTROLS, "composed controls");

  const timestamps = Object.values(controls).map((control) => {
    const value = Date.parse(control.recordedAt);
    if (!Number.isFinite(value)) {
      fail(
        "INFRA_SECURITY_COMPOSE_TIMESTAMP_INVALID",
        "Every control must contain a valid recordedAt timestamp",
      );
    }
    return value;
  });
  const recordedAt = new Date(Math.max(...timestamps)).toISOString();

  const manifest = {
    schemaVersion: 1,
    check: "deca-infrastructure-security-acceptance",
    recordedAt,
    controls,
  };

  try {
    return validateInfrastructureSecurityAcceptance(manifest);
  } catch {
    fail(
      "INFRA_SECURITY_COMPOSE_VALIDATION_FAILED",
      "Composed infrastructure-security bundle failed the canonical validator",
    );
  }
};

const parseArgs = (argv) => {
  const values = {};
  for (const arg of argv) {
    const [key, ...rest] = arg.split("=");
    const value = rest.join("=");
    if (!key.startsWith("--") || !value) {
      fail("INFRA_SECURITY_COMPOSE_ARGUMENT_INVALID", `Invalid argument: ${arg}`);
    }
    values[key.slice(2)] = value;
  }
  return values;
};

const requireArg = (args, name) => {
  const value = args[name];
  if (!value) {
    fail("INFRA_SECURITY_COMPOSE_ARGUMENT_REQUIRED", `--${name} is required`);
  }
  return value;
};

const runCli = async () => {
  const args = parseArgs(process.argv.slice(2));
  const atlasRuntimeResult = await verifyAtlasRuntimeSecurityEvidence({
    inspectionPath: requireArg(args, "atlas-inspection"),
    roleEvidencePath: requireArg(args, "atlas-role-evidence"),
    networkEvidencePath: requireArg(args, "atlas-network-evidence"),
    runtimeSecretEvidencePath: requireArg(args, "runtime-secret-evidence"),
  });
  const tenantIsolationResult = await verifyDeployedTenantIsolationEvidence({
    evidencePath: requireArg(args, "tenant-evidence"),
    checksumPath: args["tenant-checksum"],
  });
  const rollbackResult = await verifyDeploymentReadinessRollbackEvidence({
    evidencePath: requireArg(args, "rollback-evidence"),
    checksumPath: args["rollback-checksum"],
  });
  const hostingerWafResult = await verifyHostingerWafConfigurationEvidence({
    inspectionPath: requireArg(args, "waf-inspection"),
    providerEvidencePath: requireArg(args, "waf-provider-evidence"),
    edgeEvidencePath: requireArg(args, "edge-evidence"),
    edgeChecksumPath: args["edge-checksum"],
  });

  const result = composeInfrastructureSecurityAcceptance({
    atlasRuntimeResult,
    tenantIsolationResult,
    rollbackResult,
    hostingerWafResult,
  });
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (args.output) {
    await writeFile(resolve(args.output), serialized, { mode: 0o600 });
  }
  process.stdout.write(serialized);
};

const invoked = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invoked && import.meta.url === invoked) {
  runCli().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        check: "infrastructure-security-evidence-compose",
        code:
          typeof error?.code === "string"
            ? error.code
            : "INFRA_SECURITY_COMPOSE_FAILED",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
