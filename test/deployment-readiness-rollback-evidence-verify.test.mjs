import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyDeploymentReadinessRollbackEvidence } from "../scripts/production/deployment-readiness-rollback-evidence-verify.mjs";

const validEvidence = () => ({
  schemaVersion: 1,
  check: "kairoseth-deca-deployment-readiness-rollback",
  recordedAt: "2026-10-06T19:30:00Z",
  repository: "Emmakex/kairoseth-platform",
  commit: "a".repeat(40),
  runId: "37520000001",
  runAttempt: "1",
  readOnlyProductionProbe: true,
  productionMutationPerformed: false,
  readiness: {
    boundary: "/api/health",
    deployedRevision: "a".repeat(40),
    status: "pass",
  },
  rollback: {
    strategy: "git-revert-main-and-redeploy",
    targetRevision: "b".repeat(40),
    targetTree: "c".repeat(40),
    exactTreeRestored: true,
    targetBuildPassed: true,
    rehearsalOnly: true,
  },
  deploymentReadinessRollback: true,
});

const withTempDir = async (fn) => {
  const directory = await mkdtemp(join(tmpdir(), "deca-readiness-rollback-"));
  try {
    return await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const writeEvidence = async (directory, evidence, checksumBytes = null) => {
  const evidencePath = join(directory, "acceptance-evidence.json");
  const checksumPath = `${evidencePath}.sha256`;
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await writeFile(evidencePath, bytes, { mode: 0o600 });
  const digest = createHash("sha256").update(checksumBytes ?? bytes).digest("hex");
  await writeFile(checksumPath, `${digest}  acceptance-evidence.json\n`, { mode: 0o600 });
  return { evidencePath, checksumPath, digest };
};

test("promotes valid protected readiness/rollback evidence into the exact infrastructure control", async () => {
  await withTempDir(async (directory) => {
    const { evidencePath, checksumPath, digest } = await writeEvidence(directory, validEvidence());
    const result = await verifyDeploymentReadinessRollbackEvidence({ evidencePath, checksumPath });

    assert.equal(result.controlName, "deploymentReadinessRollback");
    assert.deepEqual(result.source, {
      repository: "Emmakex/kairoseth-platform",
      commit: "a".repeat(40),
      runId: "37520000001",
      runAttempt: "1",
      rollbackRevision: "b".repeat(40),
    });
    assert.deepEqual(result.control, {
      status: "pass",
      evidenceSha256: `sha256:${digest}`,
      referenceId: "kairoseth-platform-readiness-rollback-run-37520000001-attempt-1",
      recordedAt: "2026-10-06T19:30:00Z",
    });
    assert.deepEqual(Object.keys(result.control).sort(), [
      "evidenceSha256",
      "recordedAt",
      "referenceId",
      "status",
    ]);
  });
});

test("fails closed when retained bytes no longer match the workflow checksum", async () => {
  await withTempDir(async (directory) => {
    const original = validEvidence();
    const originalBytes = Buffer.from(`${JSON.stringify(original, null, 2)}\n`, "utf8");
    const tampered = validEvidence();
    tampered.rollback.targetBuildPassed = false;
    const { evidencePath, checksumPath } = await writeEvidence(directory, tampered, originalBytes);

    await assert.rejects(
      verifyDeploymentReadinessRollbackEvidence({ evidencePath, checksumPath }),
      (error) => error?.code === "DEPLOYMENT_ROLLBACK_CHECKSUM_MISMATCH",
    );
  });
});

test("rejects evidence unless the deployed readiness boundary serves the exact source commit", async () => {
  await withTempDir(async (directory) => {
    const evidence = validEvidence();
    evidence.readiness.deployedRevision = "d".repeat(40);
    const { evidencePath, checksumPath } = await writeEvidence(directory, evidence);

    await assert.rejects(
      verifyDeploymentReadinessRollbackEvidence({ evidencePath, checksumPath }),
      (error) => error?.code === "DEPLOYMENT_ROLLBACK_READINESS_INVALID",
    );
  });
});

test("rejects destructive or incomplete rollback evidence", async () => {
  await withTempDir(async (directory) => {
    const destructive = validEvidence();
    destructive.productionMutationPerformed = true;
    let files = await writeEvidence(directory, destructive);
    await assert.rejects(
      verifyDeploymentReadinessRollbackEvidence(files),
      (error) => error?.code === "DEPLOYMENT_ROLLBACK_MUTATION_POLICY_INVALID",
    );

    const incomplete = validEvidence();
    incomplete.rollback.exactTreeRestored = false;
    files = await writeEvidence(directory, incomplete);
    await assert.rejects(
      verifyDeploymentReadinessRollbackEvidence(files),
      (error) => error?.code === "DEPLOYMENT_ROLLBACK_REHEARSAL_INVALID",
    );
  });
});

test("rejects secret-bearing or unexpected retained fields", async () => {
  await withTempDir(async (directory) => {
    const secret = validEvidence();
    secret.apiKey = "must-not-be-retained";
    let files = await writeEvidence(directory, secret);
    await assert.rejects(
      verifyDeploymentReadinessRollbackEvidence(files),
      (error) => error?.code === "DEPLOYMENT_ROLLBACK_EVIDENCE_SECRET_MATERIAL",
    );

    const unexpected = validEvidence();
    unexpected.notes = "manual override";
    files = await writeEvidence(directory, unexpected);
    await assert.rejects(
      verifyDeploymentReadinessRollbackEvidence(files),
      (error) => error?.code === "DEPLOYMENT_ROLLBACK_EVIDENCE_SHAPE_INVALID",
    );
  });
});
