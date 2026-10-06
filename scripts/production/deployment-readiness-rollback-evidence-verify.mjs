import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const RUN_ID = /^\d{1,20}$/;
const RUN_ATTEMPT = /^\d{1,6}$/;
const SOURCE_REPOSITORY = "Emmakex/kairoseth-platform";

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const exactKeys = (value, expectedKeys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("DEPLOYMENT_ROLLBACK_EVIDENCE_SHAPE_INVALID", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    !actual.every((key, index) => key === expected[index])
  ) {
    fail(
      "DEPLOYMENT_ROLLBACK_EVIDENCE_SHAPE_INVALID",
      `${label} keys must be exactly: ${expected.join(", ")}`,
    );
  }
};

const parseChecksum = (text) => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length !== 1) {
    fail(
      "DEPLOYMENT_ROLLBACK_CHECKSUM_INVALID",
      "Checksum evidence must contain exactly one SHA-256 record",
    );
  }
  const match = lines[0].match(/^([a-f0-9]{64})(?:\s+[* ]?.+)?$/);
  if (!match || !HEX64.test(match[1])) {
    fail(
      "DEPLOYMENT_ROLLBACK_CHECKSUM_INVALID",
      "Checksum evidence must start with 64 lowercase SHA-256 hex characters",
    );
  }
  return match[1];
};

const assertNoSecretMaterial = (bytes) => {
  const raw = bytes.toString("utf8");
  const secretField = /"(?:api[_-]?key|authorization|token|secret|password|mongodb[_-]?uri|connectionString)"\s*:/i;
  const bearer = /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i;
  if (secretField.test(raw) || bearer.test(raw)) {
    fail(
      "DEPLOYMENT_ROLLBACK_EVIDENCE_SECRET_MATERIAL",
      "Retained deployment rollback evidence contains secret-bearing material",
    );
  }
};

export const verifyDeploymentReadinessRollbackEvidence = async ({
  evidencePath,
  checksumPath,
}) => {
  if (!evidencePath) {
    fail(
      "DEPLOYMENT_ROLLBACK_EVIDENCE_REQUIRED",
      "Kairoseth Platform deployment readiness/rollback evidence path is required",
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
      "DEPLOYMENT_ROLLBACK_CHECKSUM_MISMATCH",
      `Evidence SHA-256 does not match ${basename(resolvedChecksum)}`,
    );
  }

  assertNoSecretMaterial(bytes);

  let evidence;
  try {
    evidence = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(
      "DEPLOYMENT_ROLLBACK_EVIDENCE_JSON_INVALID",
      "Deployment readiness/rollback evidence is not valid JSON",
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
      "readOnlyProductionProbe",
      "productionMutationPerformed",
      "readiness",
      "rollback",
      "deploymentReadinessRollback",
    ],
    "evidence",
  );

  if (evidence.schemaVersion !== 1) {
    fail("DEPLOYMENT_ROLLBACK_SCHEMA_INVALID", "schemaVersion must be 1");
  }
  if (evidence.check !== "kairoseth-deca-deployment-readiness-rollback") {
    fail("DEPLOYMENT_ROLLBACK_CHECK_INVALID", "Unexpected readiness/rollback check name");
  }
  if (evidence.repository !== SOURCE_REPOSITORY) {
    fail(
      "DEPLOYMENT_ROLLBACK_SOURCE_INVALID",
      `Evidence repository must be ${SOURCE_REPOSITORY}`,
    );
  }
  if (!HEX40.test(evidence.commit)) {
    fail("DEPLOYMENT_ROLLBACK_COMMIT_INVALID", "Source commit must be 40 lowercase hex characters");
  }
  if (!RUN_ID.test(String(evidence.runId)) || !RUN_ATTEMPT.test(String(evidence.runAttempt))) {
    fail("DEPLOYMENT_ROLLBACK_RUN_INVALID", "Source run provenance is invalid");
  }
  if (!ISO_UTC.test(evidence.recordedAt)) {
    fail("DEPLOYMENT_ROLLBACK_TIMESTAMP_INVALID", "recordedAt must be an ISO UTC timestamp");
  }
  if (
    evidence.readOnlyProductionProbe !== true ||
    evidence.productionMutationPerformed !== false
  ) {
    fail(
      "DEPLOYMENT_ROLLBACK_MUTATION_POLICY_INVALID",
      "Evidence must prove a read-only production probe and zero production mutation",
    );
  }

  exactKeys(evidence.readiness, ["boundary", "deployedRevision", "status"], "readiness");
  if (
    evidence.readiness.boundary !== "/api/health" ||
    evidence.readiness.status !== "pass" ||
    evidence.readiness.deployedRevision !== evidence.commit
  ) {
    fail(
      "DEPLOYMENT_ROLLBACK_READINESS_INVALID",
      "Readiness must prove /api/health serving the exact source commit",
    );
  }

  exactKeys(
    evidence.rollback,
    [
      "strategy",
      "targetRevision",
      "targetTree",
      "exactTreeRestored",
      "targetBuildPassed",
      "rehearsalOnly",
    ],
    "rollback",
  );
  if (
    evidence.rollback.strategy !== "git-revert-main-and-redeploy" ||
    !HEX40.test(evidence.rollback.targetRevision) ||
    !HEX40.test(evidence.rollback.targetTree) ||
    evidence.rollback.targetRevision === evidence.commit ||
    evidence.rollback.exactTreeRestored !== true ||
    evidence.rollback.targetBuildPassed !== true ||
    evidence.rollback.rehearsalOnly !== true
  ) {
    fail(
      "DEPLOYMENT_ROLLBACK_REHEARSAL_INVALID",
      "Rollback evidence must prove an exact-tree, buildable, non-destructive Git-revert rehearsal",
    );
  }

  if (evidence.deploymentReadinessRollback !== true) {
    fail(
      "DEPLOYMENT_ROLLBACK_RESULT_INVALID",
      "deploymentReadinessRollback must be true",
    );
  }

  return {
    status: "ok",
    check: "deployment-readiness-rollback-evidence-verify",
    controlName: "deploymentReadinessRollback",
    source: {
      repository: evidence.repository,
      commit: evidence.commit,
      runId: String(evidence.runId),
      runAttempt: String(evidence.runAttempt),
      rollbackRevision: evidence.rollback.targetRevision,
    },
    control: {
      status: "pass",
      evidenceSha256: `sha256:${digest}`,
      referenceId: `kairoseth-platform-readiness-rollback-run-${evidence.runId}-attempt-${evidence.runAttempt}`,
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
    else fail("DEPLOYMENT_ROLLBACK_ARGUMENT_INVALID", `Unexpected argument: ${arg}`);
  }
  return values;
};

const runCli = async () => {
  try {
    const result = await verifyDeploymentReadinessRollbackEvidence(
      parseArgs(process.argv.slice(2)),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        check: "deployment-readiness-rollback-evidence-verify",
        code:
          typeof error?.code === "string"
            ? error.code
            : "DEPLOYMENT_ROLLBACK_EVIDENCE_VERIFY_FAILED",
      })}\n`,
    );
    process.exitCode = 1;
  }
};

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invoked && import.meta.url === invoked) {
  await runCli();
}
