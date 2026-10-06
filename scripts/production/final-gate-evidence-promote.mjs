import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const RUN_ID = /^\d{1,20}$/;
const RUN_ATTEMPT = /^\d{1,6}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SUPPORTED = new Set(["atlasCore", "drRestore", "kairosethEngine", "hostingerEdge"]);

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const exactKeys = (value, expectedKeys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("FINAL_GATE_EVIDENCE_SHAPE_INVALID", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || !actual.every((key, i) => key === expected[i])) {
    fail("FINAL_GATE_EVIDENCE_SHAPE_INVALID", `${label} keys must be exactly: ${expected.join(", ")}`);
  }
};

const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const parseChecksum = (text) => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length !== 1) fail("FINAL_GATE_CHECKSUM_INVALID", "Checksum must contain one SHA-256 record");
  const match = lines[0].match(/^([a-f0-9]{64})(?:\s+[* ]?.+)?$/);
  if (!match) fail("FINAL_GATE_CHECKSUM_INVALID", "Checksum record is invalid");
  return `sha256:${match[1]}`;
};

const assertNoSecrets = (bytes) => {
  const raw = bytes.toString("utf8");
  if (
    /"(?:api[_-]?key|authorization|password|secret|mongodb[_-]?uri|connectionString)"\s*:/i.test(raw) ||
    /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i.test(raw) ||
    /mongodb(?:\+srv)?:\/\//i.test(raw)
  ) {
    fail("FINAL_GATE_EVIDENCE_SECRET_MATERIAL", "Evidence contains secret-bearing material");
  }
};

const assertIdentity = (evidence, repository) => {
  if (evidence.repository !== repository) fail("FINAL_GATE_SOURCE_INVALID", `Evidence repository must be ${repository}`);
  if (!HEX40.test(String(evidence.commit ?? ""))) fail("FINAL_GATE_COMMIT_INVALID", "Evidence commit must be 40 lowercase hex");
  if (!RUN_ID.test(String(evidence.runId ?? "")) || !RUN_ATTEMPT.test(String(evidence.runAttempt ?? ""))) {
    fail("FINAL_GATE_RUN_INVALID", "Evidence run provenance is invalid");
  }
  if (!ISO_UTC.test(String(evidence.recordedAt ?? ""))) fail("FINAL_GATE_TIMESTAMP_INVALID", "Evidence timestamp is invalid");
};

const assertZeroAnomalies = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("FINAL_GATE_RESULT_INVALID", `${label} is invalid`);
  for (const key of ["missingBeforeRetention", "missingAfterRetention", "orphanedArtifacts", "purgedArtifactsStillPresent"]) {
    if (Number(value[key] ?? NaN) !== 0) fail("FINAL_GATE_RESULT_INVALID", `${label}.${key} must be zero`);
  }
};

const validateAtlasCore = (evidence) => {
  exactKeys(evidence, ["schemaVersion","check","scope","repository","commit","runId","runAttempt","recordedAt","result"], "atlasCore evidence");
  if (evidence.schemaVersion !== 1 || evidence.check !== "deca-atlas-core-acceptance" || evidence.scope !== "deca-only") {
    fail("FINAL_GATE_RESULT_INVALID", "Atlas core evidence identity is invalid");
  }
  assertIdentity(evidence, "Emmakex/puente-deca");
  const result = evidence.result;
  exactKeys(result, ["status","check","scope","database","artifactBucket","steps","evidence","reconciliation"], "atlasCore result");
  if (result.status !== "ok" || result.check !== "deca-atlas-core-acceptance" || result.scope !== "deca-only" || result.database !== "kairoseth" || result.artifactBucket !== "deca_pdf") {
    fail("FINAL_GATE_RESULT_INVALID", "Atlas core result is not canonical and green");
  }
  exactKeys(result.steps, ["preflight","atlasGridFs","atlasConcurrency","artifactReconciliation"], "atlasCore steps");
  if (Object.values(result.steps).some((value) => value !== true)) fail("FINAL_GATE_RESULT_INVALID", "Every Atlas core step must pass");
  exactKeys(result.evidence, ["metadataPing","artifactPing","indexContract","transactionRollback","gridfsRoundTrip","gridfsCleanup","idempotencyConcurrency","idempotencyConverged","documentVersionConcurrency","documentLineageConsistent","cleanupVerified"], "atlasCore checks");
  if (Object.values(result.evidence).some((value) => value !== true)) fail("FINAL_GATE_RESULT_INVALID", "Every Atlas core check must pass");
  assertZeroAnomalies(result.reconciliation, "atlasCore reconciliation");
};

const validateDrRestore = (evidence) => {
  exactKeys(evidence, ["schemaVersion","check","repository","commit","runId","runAttempt","recordedAt","result"], "drRestore evidence");
  if (evidence.schemaVersion !== 1 || evidence.check !== "puente-deca-backup-restore-production-acceptance") {
    fail("FINAL_GATE_RESULT_INVALID", "DR evidence identity is invalid");
  }
  assertIdentity(evidence, "Emmakex/puente-deca");
  const result = evidence.result;
  exactKeys(result, ["status","check","backup","restore"], "drRestore result");
  if (result.status !== "ok" || result.check !== "puente-deca-backup-restore-acceptance") fail("FINAL_GATE_RESULT_INVALID", "DR result is not green");
  exactKeys(result.backup, ["bytes","sha256","namespaces","sourceCollectionSetSha256"], "DR backup");
  if (!(Number(result.backup.bytes) > 0) || !SHA256.test(String(result.backup.sha256 ?? "")) || !SHA256.test(String(result.backup.sourceCollectionSetSha256 ?? "")) || !Array.isArray(result.backup.namespaces) || result.backup.namespaces.length === 0) {
    fail("FINAL_GATE_RESULT_INVALID", "DR backup metadata is invalid");
  }
  exactKeys(result.restore, ["database","allArtifactsVerified","artifactsVerified","artifactBytesVerified","metadataArtifactLinksVerified","reconciliation","cleanedUp","preserved"], "DR restore");
  if (!/^kairoseth_deca_dr_[A-Za-z0-9_-]+$/.test(String(result.restore.database ?? "")) || result.restore.allArtifactsVerified !== true || !(Number(result.restore.artifactsVerified) > 0) || !(Number(result.restore.artifactBytesVerified) > 0) || Number(result.restore.metadataArtifactLinksVerified) !== Number(result.restore.artifactsVerified) || result.restore.cleanedUp !== true || result.restore.preserved !== false) {
    fail("FINAL_GATE_RESULT_INVALID", "DR restore result is incomplete");
  }
  assertZeroAnomalies(result.restore.reconciliation, "DR reconciliation");
};

const validateKairosethEngine = (evidence) => {
  exactKeys(evidence, ["schemaVersion","check","repository","commit","runId","runAttempt","recordedAt","readOnly","productionMutations","shipmentIdSha256","publicPdfUrlSha256","pdfSha256","publicHeaderPrivacy","engineBridge"], "kairosethEngine evidence");
  if (evidence.schemaVersion !== 1 || evidence.check !== "kairoseth-cargo-engine-production-acceptance") fail("FINAL_GATE_RESULT_INVALID", "Engine evidence identity is invalid");
  assertIdentity(evidence, "Emmakex/kairoseth-platform");
  if (evidence.readOnly !== true || evidence.productionMutations !== false || !SHA256.test(String(evidence.shipmentIdSha256 ?? "")) || !SHA256.test(String(evidence.publicPdfUrlSha256 ?? "")) || !SHA256.test(String(evidence.pdfSha256 ?? "")) || evidence.publicHeaderPrivacy !== "passed" || evidence.engineBridge !== "passed") {
    fail("FINAL_GATE_RESULT_INVALID", "Engine evidence is not completion-grade");
  }
};

const validateHostingerEdge = (evidence) => {
  exactKeys(evidence, ["schemaVersion","check","recordedAt","repository","commit","runId","runAttempt","publicPdfUrlSha256","pdfSha256","httpStatus","tlsVerified","hostingerCdnObserved","contentSecurityPolicyFailClosed","remoteIp","safeReplayRequests","tamperedTokenStatus","pathTraversalStatus","forbiddenHeaderLeak","volumetricLoadTestPerformed"], "hostingerEdge evidence");
  if (evidence.schemaVersion !== 1 || evidence.check !== "kairoseth-cargo-hostinger-edge-acceptance") fail("FINAL_GATE_RESULT_INVALID", "Hostinger edge evidence identity is invalid");
  assertIdentity(evidence, "Emmakex/kairoseth-platform");
  if (!SHA256.test(String(evidence.publicPdfUrlSha256 ?? "")) || !SHA256.test(String(evidence.pdfSha256 ?? "")) || evidence.httpStatus !== 200 || evidence.tlsVerified !== true || evidence.hostingerCdnObserved !== true || evidence.contentSecurityPolicyFailClosed !== true || Number(evidence.safeReplayRequests) !== 8 || Number(evidence.tamperedTokenStatus) === 200 || Number(evidence.pathTraversalStatus) === 200 || evidence.forbiddenHeaderLeak !== false || evidence.volumetricLoadTestPerformed !== false) {
    fail("FINAL_GATE_RESULT_INVALID", "Hostinger edge evidence is not completion-grade");
  }
};

const validators = {
  atlasCore: validateAtlasCore,
  drRestore: validateDrRestore,
  kairosethEngine: validateKairosethEngine,
  hostingerEdge: validateHostingerEdge,
};

export const promoteFinalGateEvidence = async ({ gateName, evidencePath, checksumPath }) => {
  if (!SUPPORTED.has(gateName)) fail("FINAL_GATE_NAME_INVALID", "Unsupported final gate name");
  if (!evidencePath) fail("FINAL_GATE_EVIDENCE_REQUIRED", "Evidence path is required");
  const resolvedEvidence = resolve(evidencePath);
  const resolvedChecksum = resolve(checksumPath || `${resolvedEvidence}.sha256`);
  const [bytes, checksumText] = await Promise.all([readFile(resolvedEvidence), readFile(resolvedChecksum, "utf8")]);
  if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024) fail("FINAL_GATE_EVIDENCE_SIZE_INVALID", "Evidence size is invalid");
  assertNoSecrets(bytes);
  const evidenceSha256 = digest(bytes);
  if (parseChecksum(checksumText) !== evidenceSha256) fail("FINAL_GATE_CHECKSUM_MISMATCH", "Evidence checksum does not match retained bytes");
  let evidence;
  try { evidence = JSON.parse(bytes.toString("utf8")); } catch { fail("FINAL_GATE_EVIDENCE_JSON_INVALID", "Evidence is not valid JSON"); }
  validators[gateName](evidence);
  return {
    status: "ok",
    check: "final-gate-evidence-promote",
    gateName,
    gate: {
      status: "pass",
      evidenceSha256,
      repository: evidence.repository,
      commit: evidence.commit,
      runId: String(evidence.runId),
      recordedAt: evidence.recordedAt,
    },
  };
};

const parseArgs = (argv) => {
  const values = {};
  for (const arg of argv) {
    if (arg.startsWith("--gate=")) values.gateName = arg.slice(7);
    else if (arg.startsWith("--evidence=")) values.evidencePath = arg.slice(11);
    else if (arg.startsWith("--checksum=")) values.checksumPath = arg.slice(11);
    else fail("FINAL_GATE_ARGUMENT_INVALID", `Unexpected argument: ${arg}`);
  }
  return values;
};

const runCli = async () => {
  try {
    const result = await promoteFinalGateEvidence(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "error", check: "final-gate-evidence-promote", code: typeof error?.code === "string" ? error.code : "FINAL_GATE_EVIDENCE_PROMOTE_FAILED" })}\n`);
    process.exitCode = 1;
  }
};

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invoked && import.meta.url === invoked) await runCli();
