import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const RAW_SHA256_RE = /^[a-f0-9]{64}$/;
const COMMIT_RE = /^[a-f0-9]{40}$/;
const RUN_ID_RE = /^\d{1,20}$/;
const RUN_ATTEMPT_RE = /^\d{1,6}$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SOURCE_REPOSITORY = "Emmakex/kairoseth-platform";

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("TENANT_ISOLATION_EVIDENCE_SHAPE_INVALID", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    !actual.every((key, index) => key === wanted[index])
  ) {
    fail(
      "TENANT_ISOLATION_EVIDENCE_SHAPE_INVALID",
      `${label} keys must be exactly: ${wanted.join(", ")}`,
    );
  }
};

const parseChecksum = (text) => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length !== 1) {
    fail(
      "TENANT_ISOLATION_CHECKSUM_INVALID",
      "Checksum evidence must contain exactly one SHA-256 record",
    );
  }
  const match = lines[0].match(/^([a-f0-9]{64})(?:\s+[* ]?.+)?$/);
  if (!match || !RAW_SHA256_RE.test(match[1])) {
    fail(
      "TENANT_ISOLATION_CHECKSUM_INVALID",
      "Checksum evidence must start with 64 lowercase SHA-256 hex characters",
    );
  }
  return match[1];
};

const assertNoSecretMaterial = (bytes) => {
  const text = bytes.toString("utf8");
  const secretField = /"(?:api[_-]?key|authorization|token|secret|password|mongodb[_-]?uri|connectionString)"\s*:/i;
  const bearer = /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i;
  if (secretField.test(text) || bearer.test(text)) {
    fail(
      "TENANT_ISOLATION_EVIDENCE_SECRET_MATERIAL",
      "Retained tenant-isolation evidence contains secret-bearing material",
    );
  }
};

export const verifyDeployedTenantIsolationEvidence = async ({
  evidencePath,
  checksumPath,
}) => {
  if (!evidencePath) {
    fail(
      "TENANT_ISOLATION_EVIDENCE_REQUIRED",
      "Kairoseth Platform tenant-isolation evidence path is required",
    );
  }

  const resolvedEvidence = resolve(evidencePath);
  const resolvedChecksum = resolve(checksumPath || `${resolvedEvidence}.sha256`);
  const [bytes, checksumText] = await Promise.all([
    readFile(resolvedEvidence),
    readFile(resolvedChecksum, "utf8"),
  ]);

  const digest = createHash("sha256").update(bytes).digest("hex");
  const expectedDigest = parseChecksum(checksumText);
  if (digest !== expectedDigest) {
    fail(
      "TENANT_ISOLATION_CHECKSUM_MISMATCH",
      `Evidence SHA-256 does not match ${basename(resolvedChecksum)}`,
    );
  }

  assertNoSecretMaterial(bytes);

  let evidence;
  try {
    evidence = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(
      "TENANT_ISOLATION_EVIDENCE_JSON_INVALID",
      "Tenant-isolation evidence is not valid JSON",
    );
  }

  exactKeys(
    evidence,
    [
      "schemaVersion",
      "check",
      "recordedAt",
      "repository",
      "commit",
      "runId",
      "runAttempt",
      "readOnly",
      "productionMutations",
      "controlledShipmentIdSha256",
      "controlledDocumentIdSha256",
      "organizationA",
      "organizationB",
      "crossTenantObjectIdsLeaked",
      "crossTenantPrivateFieldsLeaked",
      "deployedTenantIsolation",
    ],
    "evidence",
  );

  if (evidence.schemaVersion !== 2) {
    fail("TENANT_ISOLATION_SCHEMA_INVALID", "schemaVersion must be 2");
  }
  if (evidence.check !== "kairoseth-cargo-deployed-tenant-isolation") {
    fail("TENANT_ISOLATION_CHECK_INVALID", "Unexpected tenant-isolation check name");
  }
  if (evidence.repository !== SOURCE_REPOSITORY) {
    fail(
      "TENANT_ISOLATION_SOURCE_INVALID",
      `Evidence repository must be ${SOURCE_REPOSITORY}`,
    );
  }
  if (!COMMIT_RE.test(evidence.commit)) {
    fail("TENANT_ISOLATION_COMMIT_INVALID", "Source commit must be 40 lowercase hex characters");
  }
  if (typeof evidence.runId !== "string" || !RUN_ID_RE.test(evidence.runId)) {
    fail("TENANT_ISOLATION_RUN_INVALID", "Source runId is invalid");
  }
  if (
    typeof evidence.runAttempt !== "string" ||
    !RUN_ATTEMPT_RE.test(evidence.runAttempt)
  ) {
    fail("TENANT_ISOLATION_RUN_INVALID", "Source runAttempt is invalid");
  }
  if (typeof evidence.recordedAt !== "string" || !ISO_UTC_RE.test(evidence.recordedAt)) {
    fail("TENANT_ISOLATION_TIMESTAMP_INVALID", "recordedAt must be an ISO UTC timestamp");
  }
  if (evidence.readOnly !== true || evidence.productionMutations !== false) {
    fail(
      "TENANT_ISOLATION_MUTATION_POLICY_INVALID",
      "Evidence must prove a read-only acceptance run with no production mutations",
    );
  }
  if (!SHA256_RE.test(evidence.controlledShipmentIdSha256)) {
    fail("TENANT_ISOLATION_OBJECT_HASH_INVALID", "controlledShipmentIdSha256 is invalid");
  }
  if (!SHA256_RE.test(evidence.controlledDocumentIdSha256)) {
    fail("TENANT_ISOLATION_OBJECT_HASH_INVALID", "controlledDocumentIdSha256 is invalid");
  }

  exactKeys(
    evidence.organizationA,
    ["shipmentDirectRead", "privateDocumentMetadataRead"],
    "organizationA",
  );
  if (
    evidence.organizationA.shipmentDirectRead !== true ||
    evidence.organizationA.privateDocumentMetadataRead !== true
  ) {
    fail(
      "TENANT_ISOLATION_OWNER_READ_INVALID",
      "Organization A must prove shipment and private DeCA metadata reads",
    );
  }

  exactKeys(
    evidence.organizationB,
    [
      "credentialValid",
      "shipmentListIsolation",
      "shipmentDirectObjectDenied",
      "privateDocumentMetadataDenied",
    ],
    "organizationB",
  );
  if (
    evidence.organizationB.credentialValid !== true ||
    evidence.organizationB.shipmentListIsolation !== true ||
    evidence.organizationB.shipmentDirectObjectDenied !== true ||
    evidence.organizationB.privateDocumentMetadataDenied !== true
  ) {
    fail(
      "TENANT_ISOLATION_CROSS_TENANT_DENIAL_INVALID",
      "Organization B must prove list isolation plus shipment and private DeCA metadata denial",
    );
  }

  if (
    evidence.crossTenantObjectIdsLeaked !== false ||
    evidence.crossTenantPrivateFieldsLeaked !== false ||
    evidence.deployedTenantIsolation !== true
  ) {
    fail(
      "TENANT_ISOLATION_LEAK_POLICY_INVALID",
      "Evidence must prove zero controlled-object/private-field leakage and deployed isolation pass",
    );
  }

  return {
    status: "ok",
    check: "deployed-tenant-isolation-evidence-verify",
    controlName: "deployedTenantIsolation",
    source: {
      repository: evidence.repository,
      commit: evidence.commit,
      runId: evidence.runId,
      runAttempt: evidence.runAttempt,
    },
    control: {
      status: "pass",
      evidenceSha256: `sha256:${digest}`,
      referenceId: `kairoseth-platform-run-${evidence.runId}-attempt-${evidence.runAttempt}`,
      recordedAt: evidence.recordedAt,
    },
  };
};

const parseArgs = (argv) => {
  const values = {};
  for (const arg of argv) {
    if (arg.startsWith("--evidence=")) values.evidencePath = arg.slice("--evidence=".length);
    else if (arg.startsWith("--checksum=")) values.checksumPath = arg.slice("--checksum=".length);
    else if (!values.evidencePath) values.evidencePath = arg;
    else if (!values.checksumPath) values.checksumPath = arg;
    else fail("TENANT_ISOLATION_ARGUMENT_INVALID", `Unexpected argument: ${arg}`);
  }
  return values;
};

const runCli = async () => {
  try {
    const result = await verifyDeployedTenantIsolationEvidence(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        check: "deployed-tenant-isolation-evidence-verify",
        code:
          typeof error?.code === "string"
            ? error.code
            : "TENANT_ISOLATION_EVIDENCE_VERIFY_FAILED",
      })}\n`,
    );
    process.exitCode = 1;
  }
};

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invoked && import.meta.url === invoked) {
  await runCli();
}
