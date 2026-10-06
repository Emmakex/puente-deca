import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const REFERENCE_ID = /^[A-Za-z0-9._:-]{8,160}$/;
const ALLOWED_NETWORK_MODES = new Set([
  "ip-access-list",
  "private-endpoint",
  "network-peering",
]);

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const exactKeys = (value, expectedKeys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("ATLAS_RUNTIME_EVIDENCE_SHAPE_INVALID", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    !actual.every((key, index) => key === expected[index])
  ) {
    fail(
      "ATLAS_RUNTIME_EVIDENCE_SHAPE_INVALID",
      `${label} keys must be exactly: ${expected.join(", ")}`,
    );
  }
};

const digest = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const assertRetainedEvidenceSize = (bytes, label) => {
  if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024) {
    fail(
      "ATLAS_RUNTIME_RETAINED_EVIDENCE_INVALID",
      `${label} must be between 1 byte and 20 MiB`,
    );
  }
};

const assertManifestHasNoSecretMaterial = (bytes) => {
  const raw = bytes.toString("utf8");
  const forbidden = [
    /mongodb(?:\+srv)?:\/\//i,
    /"(?:username|password|token|secret|api[_-]?key|connectionString|uri|ip|cidr|address)"\s*:/i,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i,
    /\b(?:\d{1,3}\.){3}\d{1,3}\/(?:\d|[12]\d|3[0-2])\b/,
  ];
  if (forbidden.some((pattern) => pattern.test(raw))) {
    fail(
      "ATLAS_RUNTIME_EVIDENCE_SECRET_MATERIAL",
      "Inspection manifest contains a connection string, secret, address or other forbidden sensitive material",
    );
  }
};

const assertEvidenceHash = (value, actual, label) => {
  if (!SHA256.test(value) || value !== actual) {
    fail(
      "ATLAS_RUNTIME_EVIDENCE_HASH_MISMATCH",
      `${label} SHA-256 does not match retained bytes`,
    );
  }
};

export const verifyAtlasRuntimeSecurityEvidence = async ({
  inspectionPath,
  roleEvidencePath,
  networkEvidencePath,
  runtimeSecretEvidencePath,
}) => {
  if (
    !inspectionPath ||
    !roleEvidencePath ||
    !networkEvidencePath ||
    !runtimeSecretEvidencePath
  ) {
    fail(
      "ATLAS_RUNTIME_EVIDENCE_REQUIRED",
      "inspection, Atlas role, Atlas network and runtime-secret evidence paths are required",
    );
  }

  const [inspectionBytes, roleBytes, networkBytes, runtimeBytes] =
    await Promise.all([
      readFile(resolve(inspectionPath)),
      readFile(resolve(roleEvidencePath)),
      readFile(resolve(networkEvidencePath)),
      readFile(resolve(runtimeSecretEvidencePath)),
    ]);

  assertRetainedEvidenceSize(roleBytes, "Atlas role evidence");
  assertRetainedEvidenceSize(networkBytes, "Atlas network evidence");
  assertRetainedEvidenceSize(runtimeBytes, "runtime secret evidence");
  assertManifestHasNoSecretMaterial(inspectionBytes);

  const inspectionSha = digest(inspectionBytes);
  const roleSha = digest(roleBytes);
  const networkSha = digest(networkBytes);
  const runtimeSha = digest(runtimeBytes);

  let inspection;
  try {
    inspection = JSON.parse(inspectionBytes.toString("utf8"));
  } catch {
    fail(
      "ATLAS_RUNTIME_EVIDENCE_JSON_INVALID",
      "Atlas/runtime security inspection is not valid JSON",
    );
  }

  exactKeys(
    inspection,
    [
      "schemaVersion",
      "check",
      "recordedAt",
      "scope",
      "referenceId",
      "roleEvidenceSha256",
      "networkEvidenceSha256",
      "runtimeSecretEvidenceSha256",
      "controls",
      "providerEvidenceContainsSecrets",
      "customerDataRetained",
    ],
    "inspection",
  );

  if (inspection.schemaVersion !== 1) {
    fail("ATLAS_RUNTIME_SCHEMA_INVALID", "schemaVersion must be 1");
  }
  if (inspection.check !== "deca-atlas-runtime-security-inspection") {
    fail("ATLAS_RUNTIME_CHECK_INVALID", "Unexpected inspection check name");
  }
  if (inspection.scope !== "kairoseth-production") {
    fail("ATLAS_RUNTIME_SCOPE_INVALID", "Inspection scope must be kairoseth-production");
  }
  if (!ISO_UTC.test(inspection.recordedAt)) {
    fail("ATLAS_RUNTIME_TIMESTAMP_INVALID", "recordedAt must be an ISO UTC timestamp");
  }
  if (!REFERENCE_ID.test(inspection.referenceId)) {
    fail("ATLAS_RUNTIME_REFERENCE_INVALID", "referenceId is invalid");
  }
  if (
    inspection.providerEvidenceContainsSecrets !== false ||
    inspection.customerDataRetained !== false
  ) {
    fail(
      "ATLAS_RUNTIME_RETENTION_POLICY_INVALID",
      "Retained evidence must be sanitized and contain no customer data",
    );
  }

  assertEvidenceHash(inspection.roleEvidenceSha256, roleSha, "Atlas role evidence");
  assertEvidenceHash(
    inspection.networkEvidenceSha256,
    networkSha,
    "Atlas network evidence",
  );
  assertEvidenceHash(
    inspection.runtimeSecretEvidenceSha256,
    runtimeSha,
    "runtime secret evidence",
  );

  exactKeys(
    inspection.controls,
    ["atlasLeastPrivilege", "atlasNetworkAccess", "runtimeSecretScope"],
    "controls",
  );

  const role = inspection.controls.atlasLeastPrivilege;
  exactKeys(
    role,
    [
      "database",
      "databaseRole",
      "databaseScopeOnly",
      "dataReadWriteRequired",
      "indexManagementRequired",
      "transactionsRequired",
      "gridFsRequired",
      "additionalDatabaseRoles",
      "clusterAdmin",
      "userAdmin",
      "projectAdmin",
      "rootRole",
    ],
    "atlasLeastPrivilege",
  );
  if (
    role.database !== "kairoseth" ||
    role.databaseRole !== "readWrite" ||
    role.databaseScopeOnly !== true ||
    role.dataReadWriteRequired !== true ||
    role.indexManagementRequired !== true ||
    role.transactionsRequired !== true ||
    role.gridFsRequired !== true ||
    role.additionalDatabaseRoles !== false ||
    role.clusterAdmin !== false ||
    role.userAdmin !== false ||
    role.projectAdmin !== false ||
    role.rootRole !== false
  ) {
    fail(
      "ATLAS_LEAST_PRIVILEGE_INVALID",
      "Atlas service identity must be readWrite on kairoseth only with no administrative or additional database roles",
    );
  }

  const network = inspection.controls.atlasNetworkAccess;
  exactKeys(
    network,
    [
      "connectivityMode",
      "intendedRuntimeOnly",
      "wildcardIngress",
      "publicAnySource",
      "smallestPracticalBoundaryReviewed",
      "tlsRequired",
      "temporaryHumanAccessExpires",
    ],
    "atlasNetworkAccess",
  );
  if (
    !ALLOWED_NETWORK_MODES.has(network.connectivityMode) ||
    network.intendedRuntimeOnly !== true ||
    network.wildcardIngress !== false ||
    network.publicAnySource !== false ||
    network.smallestPracticalBoundaryReviewed !== true ||
    network.tlsRequired !== true ||
    network.temporaryHumanAccessExpires !== true
  ) {
    fail(
      "ATLAS_NETWORK_ACCESS_INVALID",
      "Atlas network access must be restricted to the intended runtime with no wildcard/public-any-source ingress",
    );
  }

  const runtime = inspection.controls.runtimeSecretScope;
  exactKeys(
    runtime,
    [
      "runtimeModel",
      "hostingerEnvironmentReviewed",
      "githubEnvironment",
      "githubEnvironmentReviewed",
      "mongodbUriServerOnly",
      "operationsHealthSecretServerOnly",
      "standaloneAcceptanceSecretStepScoped",
      "productionBridgeSecretRequired",
      "repositorySecretValuesCommitted",
      "browserSecretExposure",
      "jobWideSecretInjection",
    ],
    "runtimeSecretScope",
  );
  if (
    runtime.runtimeModel !== "hostinger-in-process-node" ||
    runtime.hostingerEnvironmentReviewed !== true ||
    runtime.githubEnvironment !== "deca-production" ||
    runtime.githubEnvironmentReviewed !== true ||
    runtime.mongodbUriServerOnly !== true ||
    runtime.operationsHealthSecretServerOnly !== true ||
    runtime.standaloneAcceptanceSecretStepScoped !== true ||
    runtime.productionBridgeSecretRequired !== false ||
    runtime.repositorySecretValuesCommitted !== false ||
    runtime.browserSecretExposure !== false ||
    runtime.jobWideSecretInjection !== false
  ) {
    fail(
      "RUNTIME_SECRET_SCOPE_INVALID",
      "Runtime secrets must remain server-only, environment-scoped and step-scoped without a production bridge secret",
    );
  }

  const control = (suffix) => ({
    status: "pass",
    evidenceSha256: inspectionSha,
    referenceId: `${inspection.referenceId}-${suffix}`,
    recordedAt: inspection.recordedAt,
  });

  return {
    status: "ok",
    check: "atlas-runtime-security-evidence-verify",
    source: {
      scope: inspection.scope,
      inspectionSha256: inspectionSha,
      roleEvidenceSha256: roleSha,
      networkEvidenceSha256: networkSha,
      runtimeSecretEvidenceSha256: runtimeSha,
    },
    controls: {
      atlasLeastPrivilege: control("atlas-role"),
      atlasNetworkAccess: control("atlas-network"),
      runtimeSecretScope: control("runtime-secrets"),
    },
  };
};

const parseArgs = (argv) => {
  const values = {};
  for (const arg of argv) {
    if (arg.startsWith("--inspection=")) {
      values.inspectionPath = arg.slice("--inspection=".length);
    } else if (arg.startsWith("--role-evidence=")) {
      values.roleEvidencePath = arg.slice("--role-evidence=".length);
    } else if (arg.startsWith("--network-evidence=")) {
      values.networkEvidencePath = arg.slice("--network-evidence=".length);
    } else if (arg.startsWith("--runtime-secret-evidence=")) {
      values.runtimeSecretEvidencePath = arg.slice(
        "--runtime-secret-evidence=".length,
      );
    } else {
      fail("ATLAS_RUNTIME_ARGUMENT_INVALID", `Unexpected argument: ${arg}`);
    }
  }
  return values;
};

const runCli = async () => {
  try {
    const result = await verifyAtlasRuntimeSecurityEvidence(
      parseArgs(process.argv.slice(2)),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        check: "atlas-runtime-security-evidence-verify",
        code:
          typeof error?.code === "string"
            ? error.code
            : "ATLAS_RUNTIME_EVIDENCE_VERIFY_FAILED",
      })}\n`,
    );
    process.exitCode = 1;
  }
};

const invoked = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invoked && import.meta.url === invoked) {
  await runCli();
}
