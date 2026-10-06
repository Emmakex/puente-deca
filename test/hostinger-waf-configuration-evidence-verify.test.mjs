import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyHostingerWafConfigurationEvidence } from "../scripts/production/hostinger-waf-configuration-evidence-verify.mjs";

const sha = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const edgeEvidence = () => ({
  schemaVersion: 1,
  check: "kairoseth-cargo-hostinger-edge-acceptance",
  recordedAt: "2026-10-06T19:40:00Z",
  repository: "Emmakex/kairoseth-platform",
  commit: "a".repeat(40),
  publicPdfUrlSha256: `sha256:${"b".repeat(64)}`,
  pdfSha256: `sha256:${"c".repeat(64)}`,
  httpStatus: 200,
  tlsVerified: true,
  hostingerCdnObserved: true,
  contentSecurityPolicyFailClosed: true,
  remoteIp: "203.0.113.10",
  safeReplayRequests: 8,
  tamperedTokenStatus: 404,
  pathTraversalStatus: 404,
  forbiddenHeaderLeak: false,
  volumetricLoadTestPerformed: false,
});

const inspection = ({ providerSha, edgeSha }) => ({
  schemaVersion: 1,
  check: "hostinger-waf-configuration-inspection",
  recordedAt: "2026-10-06T19:45:00Z",
  provider: "Hostinger",
  scope: "kairoseth.com/deca",
  providerEvidenceSha256: providerSha,
  edgeEvidenceSha256: edgeSha,
  referenceId: "hostinger-waf-inspection-20261006",
  controls: {
    cdnActive: true,
    managedEdgeSecurityEnabled: true,
    securityLevel: "medium",
    ddosProtectionEnabled: true,
    trafficBlockingReviewed: true,
    apiCompatibilityReviewed: true,
  },
  providerEvidenceContainsSecrets: false,
  customerDataRetained: false,
});

const withFixture = async (fn) => {
  const directory = await mkdtemp(join(tmpdir(), "deca-hostinger-waf-"));
  try {
    const providerEvidencePath = join(directory, "hostinger-panel-evidence.txt");
    const edgeEvidencePath = join(directory, "acceptance-evidence.json");
    const edgeChecksumPath = `${edgeEvidencePath}.sha256`;
    const inspectionPath = join(directory, "inspection.json");

    const providerBytes = Buffer.from("sanitized Hostinger hPanel evidence\n");
    const edgeBytes = Buffer.from(`${JSON.stringify(edgeEvidence(), null, 2)}\n`);
    await writeFile(providerEvidencePath, providerBytes);
    await writeFile(edgeEvidencePath, edgeBytes);
    await writeFile(edgeChecksumPath, `${sha(edgeBytes).slice(7)}  acceptance-evidence.json\n`);
    await writeFile(
      inspectionPath,
      `${JSON.stringify(inspection({ providerSha: sha(providerBytes), edgeSha: sha(edgeBytes) }), null, 2)}\n`,
    );

    return await fn({
      directory,
      inspectionPath,
      providerEvidencePath,
      edgeEvidencePath,
      edgeChecksumPath,
      providerBytes,
      edgeBytes,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test("promotes a sanitized Hostinger inspection plus protected edge proof into the exact control", async () => {
  await withFixture(async (paths) => {
    const result = await verifyHostingerWafConfigurationEvidence(paths);
    const inspectionBytes = await import("node:fs/promises").then(({ readFile }) => readFile(paths.inspectionPath));

    assert.equal(result.controlName, "hostingerWafConfiguration");
    assert.deepEqual(result.control, {
      status: "pass",
      evidenceSha256: sha(inspectionBytes),
      referenceId: "hostinger-waf-inspection-20261006",
      recordedAt: "2026-10-06T19:45:00Z",
    });
    assert.deepEqual(Object.keys(result.control).sort(), [
      "evidenceSha256",
      "recordedAt",
      "referenceId",
      "status",
    ]);
  });
});

test("rejects provider evidence that does not match the inspected artifact hash", async () => {
  await withFixture(async (paths) => {
    await writeFile(paths.providerEvidencePath, "different provider evidence\n");
    await assert.rejects(
      verifyHostingerWafConfigurationEvidence(paths),
      (error) => error?.code === "HOSTINGER_WAF_PROVIDER_HASH_MISMATCH",
    );
  });
});

test("rejects an effectively disabled or incomplete Hostinger security configuration", async () => {
  await withFixture(async (paths) => {
    const current = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(paths.inspectionPath, "utf8")));
    current.controls.securityLevel = "off";
    await writeFile(paths.inspectionPath, `${JSON.stringify(current, null, 2)}\n`);
    await assert.rejects(
      verifyHostingerWafConfigurationEvidence(paths),
      (error) => error?.code === "HOSTINGER_WAF_CONFIGURATION_INVALID",
    );
  });
});

test("rejects edge evidence that claims a volumetric test or loses CDN/CSP protection", async () => {
  await withFixture(async (paths) => {
    const edge = edgeEvidence();
    edge.volumetricLoadTestPerformed = true;
    const edgeBytes = Buffer.from(`${JSON.stringify(edge, null, 2)}\n`);
    await writeFile(paths.edgeEvidencePath, edgeBytes);
    await writeFile(paths.edgeChecksumPath, `${sha(edgeBytes).slice(7)}  acceptance-evidence.json\n`);
    const current = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(paths.inspectionPath, "utf8")));
    current.edgeEvidenceSha256 = sha(edgeBytes);
    await writeFile(paths.inspectionPath, `${JSON.stringify(current, null, 2)}\n`);

    await assert.rejects(
      verifyHostingerWafConfigurationEvidence(paths),
      (error) => error?.code === "HOSTINGER_WAF_EDGE_EVIDENCE_INVALID",
    );
  });
});

test("rejects secret-bearing inspection manifests and unexpected fields", async () => {
  await withFixture(async (paths) => {
    const current = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(paths.inspectionPath, "utf8")));
    current.apiKey = "must-not-be-retained";
    await writeFile(paths.inspectionPath, `${JSON.stringify(current, null, 2)}\n`);
    await assert.rejects(
      verifyHostingerWafConfigurationEvidence(paths),
      (error) => error?.code === "HOSTINGER_WAF_EVIDENCE_SECRET_MATERIAL",
    );
  });
});
