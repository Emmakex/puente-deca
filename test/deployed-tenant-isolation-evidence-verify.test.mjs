import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyDeployedTenantIsolationEvidence } from "../scripts/production/deployed-tenant-isolation-evidence-verify.mjs";

const validEvidence = () => ({
  schemaVersion: 2,
  check: "kairoseth-cargo-deployed-tenant-isolation",
  recordedAt: "2026-10-06T19:10:00Z",
  repository: "Emmakex/kairoseth-platform",
  commit: "a".repeat(40),
  runId: "37517034963",
  runAttempt: "1",
  readOnly: true,
  productionMutations: false,
  controlledShipmentIdSha256: `sha256:${"b".repeat(64)}`,
  controlledDocumentIdSha256: `sha256:${"c".repeat(64)}`,
  organizationA: {
    shipmentDirectRead: true,
    privateDocumentMetadataRead: true,
  },
  organizationB: {
    credentialValid: true,
    shipmentListIsolation: true,
    shipmentDirectObjectDenied: true,
    privateDocumentMetadataDenied: true,
  },
  crossTenantObjectIdsLeaked: false,
  crossTenantPrivateFieldsLeaked: false,
  deployedTenantIsolation: true,
});

const writeEvidence = async (directory, evidence, checksumBytes = null) => {
  const evidencePath = join(directory, "acceptance-evidence.json");
  const checksumPath = `${evidencePath}.sha256`;
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await writeFile(evidencePath, bytes, { mode: 0o600 });
  const checksumSource = checksumBytes ?? bytes;
  const digest = createHash("sha256").update(checksumSource).digest("hex");
  await writeFile(checksumPath, `${digest}  acceptance-evidence.json\n`, { mode: 0o600 });
  return { evidencePath, checksumPath, bytes, digest };
};

const withTempDir = async (fn) => {
  const directory = await mkdtemp(join(tmpdir(), "deca-tenant-evidence-"));
  try {
    return await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test("promotes valid Kairoseth tenant-isolation evidence into the exact infrastructure control", async () => {
  await withTempDir(async (directory) => {
    const { evidencePath, checksumPath, digest } = await writeEvidence(
      directory,
      validEvidence(),
    );
    const result = await verifyDeployedTenantIsolationEvidence({
      evidencePath,
      checksumPath,
    });

    assert.deepEqual(result.source, {
      repository: "Emmakex/kairoseth-platform",
      commit: "a".repeat(40),
      runId: "37517034963",
      runAttempt: "1",
    });
    assert.equal(result.controlName, "deployedTenantIsolation");
    assert.deepEqual(result.control, {
      status: "pass",
      evidenceSha256: `sha256:${digest}`,
      referenceId: "kairoseth-platform-run-37517034963-attempt-1",
      recordedAt: "2026-10-06T19:10:00Z",
    });
    assert.deepEqual(Object.keys(result.control).sort(), [
      "evidenceSha256",
      "recordedAt",
      "referenceId",
      "status",
    ]);
  });
});

test("fails closed when retained evidence bytes no longer match the workflow checksum", async () => {
  await withTempDir(async (directory) => {
    const evidence = validEvidence();
    const originalBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    evidence.organizationB.privateDocumentMetadataDenied = false;
    const { evidencePath, checksumPath } = await writeEvidence(
      directory,
      evidence,
      originalBytes,
    );

    await assert.rejects(
      verifyDeployedTenantIsolationEvidence({ evidencePath, checksumPath }),
      (error) => error?.code === "TENANT_ISOLATION_CHECKSUM_MISMATCH",
    );
  });
});

test("fails closed when private DeCA metadata denial is missing even with a fresh checksum", async () => {
  await withTempDir(async (directory) => {
    const evidence = validEvidence();
    evidence.organizationB.privateDocumentMetadataDenied = false;
    const { evidencePath, checksumPath } = await writeEvidence(directory, evidence);

    await assert.rejects(
      verifyDeployedTenantIsolationEvidence({ evidencePath, checksumPath }),
      (error) =>
        error?.code === "TENANT_ISOLATION_CROSS_TENANT_DENIAL_INVALID",
    );
  });
});

test("rejects secret-bearing fields instead of copying them into Puente DeCA evidence", async () => {
  await withTempDir(async (directory) => {
    const evidence = validEvidence();
    evidence.apiKey = "should-never-be-retained";
    const { evidencePath, checksumPath } = await writeEvidence(directory, evidence);

    await assert.rejects(
      verifyDeployedTenantIsolationEvidence({ evidencePath, checksumPath }),
      (error) => error?.code === "TENANT_ISOLATION_EVIDENCE_SECRET_MATERIAL",
    );
  });
});

test("rejects unexpected schema fields even when they are not secret-bearing", async () => {
  await withTempDir(async (directory) => {
    const evidence = validEvidence();
    evidence.notes = "manual override";
    const { evidencePath, checksumPath } = await writeEvidence(directory, evidence);

    await assert.rejects(
      verifyDeployedTenantIsolationEvidence({ evidencePath, checksumPath }),
      (error) => error?.code === "TENANT_ISOLATION_EVIDENCE_SHAPE_INVALID",
    );
  });
});
