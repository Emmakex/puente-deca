import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const REFERENCE_ID = /^[A-Za-z0-9._:-]{8,160}$/;
const SOURCE_REPOSITORY = "Emmakex/kairoseth-platform";
const ALLOWED_SECURITY_LEVELS = new Set(["low", "medium", "high", "under-attack"]);

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const exactKeys = (value, expectedKeys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("HOSTINGER_WAF_EVIDENCE_SHAPE_INVALID", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    !actual.every((key, index) => key === expected[index])
  ) {
    fail(
      "HOSTINGER_WAF_EVIDENCE_SHAPE_INVALID",
      `${label} keys must be exactly: ${expected.join(", ")}`,
    );
  }
};

const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const parseChecksum = (text) => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length !== 1) {
    fail("HOSTINGER_EDGE_CHECKSUM_INVALID", "Edge checksum must contain exactly one SHA-256 record");
  }
  const match = lines[0].match(/^([a-f0-9]{64})(?:\s+[* ]?.+)?$/);
  if (!match) {
    fail("HOSTINGER_EDGE_CHECKSUM_INVALID", "Edge checksum is invalid");
  }
  return `sha256:${match[1]}`;
};

const assertNoSecretMaterial = (bytes, label) => {
  const raw = bytes.toString("utf8");
  const secretField = /"(?:api[_-]?key|authorization|token|secret|password|mongodb[_-]?uri|connectionString)"\s*:/i;
  const bearer = /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i;
  if (secretField.test(raw) || bearer.test(raw)) {
    fail("HOSTINGER_WAF_EVIDENCE_SECRET_MATERIAL", `${label} contains secret-bearing material`);
  }
};

export const verifyHostingerWafConfigurationEvidence = async ({
  inspectionPath,
  providerEvidencePath,
  edgeEvidencePath,
  edgeChecksumPath,
}) => {
  if (!inspectionPath || !providerEvidencePath || !edgeEvidencePath) {
    fail(
      "HOSTINGER_WAF_EVIDENCE_REQUIRED",
      "inspection, provider evidence and protected edge evidence paths are required",
    );
  }

  const resolvedInspection = resolve(inspectionPath);
  const resolvedProviderEvidence = resolve(providerEvidencePath);
  const resolvedEdgeEvidence = resolve(edgeEvidencePath);
  const resolvedEdgeChecksum = resolve(edgeChecksumPath || `${resolvedEdgeEvidence}.sha256`);

  const [inspectionBytes, providerBytes, edgeBytes, edgeChecksumText] = await Promise.all([
    readFile(resolvedInspection),
    readFile(resolvedProviderEvidence),
    readFile(resolvedEdgeEvidence),
    readFile(resolvedEdgeChecksum, "utf8"),
  ]);

  if (providerBytes.length === 0 || providerBytes.length > 20 * 1024 * 1024) {
    fail("HOSTINGER_WAF_PROVIDER_EVIDENCE_INVALID", "Provider evidence must be between 1 byte and 20 MiB");
  }

  assertNoSecretMaterial(inspectionBytes, "inspection manifest");
  assertNoSecretMaterial(edgeBytes, "edge evidence");

  const inspectionSha = digest(inspectionBytes);
  const providerSha = digest(providerBytes);
  const edgeSha = digest(edgeBytes);
  if (parseChecksum(edgeChecksumText) !== edgeSha) {
    fail("HOSTINGER_EDGE_CHECKSUM_MISMATCH", "Edge evidence checksum does not match retained bytes");
  }

  let inspection;
  let edge;
  try {
    inspection = JSON.parse(inspectionBytes.toString("utf8"));
    edge = JSON.parse(edgeBytes.toString("utf8"));
  } catch {
    fail("HOSTINGER_WAF_EVIDENCE_JSON_INVALID", "Inspection or edge evidence is not valid JSON");
  }

  exactKeys(
    inspection,
    [
      "schemaVersion",
      "check",
      "recordedAt",
      "provider",
      "scope",
      "providerEvidenceSha256",
      "edgeEvidenceSha256",
      "referenceId",
      "controls",
      "providerEvidenceContainsSecrets",
      "customerDataRetained",
    ],
    "inspection",
  );
  if (inspection.schemaVersion !== 1) fail("HOSTINGER_WAF_SCHEMA_INVALID", "schemaVersion must be 1");
  if (inspection.check !== "hostinger-waf-configuration-inspection") {
    fail("HOSTINGER_WAF_CHECK_INVALID", "Unexpected inspection check name");
  }
  if (inspection.provider !== "Hostinger" || inspection.scope !== "kairoseth.com/deca") {
    fail("HOSTINGER_WAF_SCOPE_INVALID", "Inspection must be for Hostinger and kairoseth.com/deca");
  }
  if (!ISO_UTC.test(inspection.recordedAt)) {
    fail("HOSTINGER_WAF_TIMESTAMP_INVALID", "recordedAt must be an ISO UTC timestamp");
  }
  if (!SHA256.test(inspection.providerEvidenceSha256) || inspection.providerEvidenceSha256 !== providerSha) {
    fail("HOSTINGER_WAF_PROVIDER_HASH_MISMATCH", "Provider evidence SHA-256 does not match retained bytes");
  }
  if (!SHA256.test(inspection.edgeEvidenceSha256) || inspection.edgeEvidenceSha256 !== edgeSha) {
    fail("HOSTINGER_WAF_EDGE_HASH_MISMATCH", "Edge evidence SHA-256 does not match retained bytes");
  }
  if (!REFERENCE_ID.test(inspection.referenceId)) {
    fail("HOSTINGER_WAF_REFERENCE_INVALID", "referenceId is invalid");
  }
  if (inspection.providerEvidenceContainsSecrets !== false || inspection.customerDataRetained !== false) {
    fail(
      "HOSTINGER_WAF_RETENTION_POLICY_INVALID",
      "Provider evidence must be sanitized and contain no customer data",
    );
  }

  exactKeys(
    inspection.controls,
    [
      "cdnActive",
      "managedEdgeSecurityEnabled",
      "securityLevel",
      "ddosProtectionEnabled",
      "trafficBlockingReviewed",
      "apiCompatibilityReviewed",
    ],
    "controls",
  );
  if (
    inspection.controls.cdnActive !== true ||
    inspection.controls.managedEdgeSecurityEnabled !== true ||
    !ALLOWED_SECURITY_LEVELS.has(inspection.controls.securityLevel) ||
    inspection.controls.ddosProtectionEnabled !== true ||
    inspection.controls.trafficBlockingReviewed !== true ||
    inspection.controls.apiCompatibilityReviewed !== true
  ) {
    fail(
      "HOSTINGER_WAF_CONFIGURATION_INVALID",
      "Hostinger CDN/security/DDoS/traffic-blocking/API compatibility inspection is not fully green",
    );
  }

  exactKeys(
    edge,
    [
      "schemaVersion",
      "check",
      "recordedAt",
      "repository",
      "commit",
      "publicPdfUrlSha256",
      "pdfSha256",
      "httpStatus",
      "tlsVerified",
      "hostingerCdnObserved",
      "contentSecurityPolicyFailClosed",
      "remoteIp",
      "safeReplayRequests",
      "tamperedTokenStatus",
      "pathTraversalStatus",
      "forbiddenHeaderLeak",
      "volumetricLoadTestPerformed",
    ],
    "edge evidence",
  );
  if (
    edge.schemaVersion !== 1 ||
    edge.check !== "kairoseth-cargo-hostinger-edge-acceptance" ||
    edge.repository !== SOURCE_REPOSITORY ||
    !HEX40.test(edge.commit) ||
    !ISO_UTC.test(edge.recordedAt) ||
    !SHA256.test(edge.publicPdfUrlSha256) ||
    !SHA256.test(edge.pdfSha256) ||
    edge.httpStatus !== 200 ||
    edge.tlsVerified !== true ||
    edge.hostingerCdnObserved !== true ||
    edge.contentSecurityPolicyFailClosed !== true ||
    !Number.isInteger(edge.safeReplayRequests) ||
    edge.safeReplayRequests < 8 ||
    edge.tamperedTokenStatus === 200 ||
    edge.pathTraversalStatus === 200 ||
    edge.forbiddenHeaderLeak !== false ||
    edge.volumetricLoadTestPerformed !== false
  ) {
    fail(
      "HOSTINGER_WAF_EDGE_EVIDENCE_INVALID",
      "Protected Hostinger edge acceptance is incomplete or unsafe",
    );
  }

  return {
    status: "ok",
    check: "hostinger-waf-configuration-evidence-verify",
    controlName: "hostingerWafConfiguration",
    source: {
      provider: inspection.provider,
      scope: inspection.scope,
      providerEvidenceSha256: providerSha,
      edgeEvidenceSha256: edgeSha,
      edgeCommit: edge.commit,
    },
    control: {
      status: "pass",
      evidenceSha256: inspectionSha,
      referenceId: inspection.referenceId,
      recordedAt: inspection.recordedAt,
    },
  };
};

const parseArgs = (argv) => {
  const values = {};
  for (const arg of argv) {
    if (arg.startsWith("--inspection=")) values.inspectionPath = arg.slice("--inspection=".length);
    else if (arg.startsWith("--provider-evidence=")) values.providerEvidencePath = arg.slice("--provider-evidence=".length);
    else if (arg.startsWith("--edge-evidence=")) values.edgeEvidencePath = arg.slice("--edge-evidence=".length);
    else if (arg.startsWith("--edge-checksum=")) values.edgeChecksumPath = arg.slice("--edge-checksum=".length);
    else fail("HOSTINGER_WAF_ARGUMENT_INVALID", `Unexpected argument: ${arg}`);
  }
  return values;
};

const runCli = async () => {
  try {
    const result = await verifyHostingerWafConfigurationEvidence(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        check: "hostinger-waf-configuration-evidence-verify",
        code: typeof error?.code === "string" ? error.code : "HOSTINGER_WAF_EVIDENCE_VERIFY_FAILED",
      })}\n`,
    );
    process.exitCode = 1;
  }
};

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invoked && import.meta.url === invoked) {
  await runCli();
}
