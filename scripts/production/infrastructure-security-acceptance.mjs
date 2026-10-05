import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_CONTROLS = [
  "atlasLeastPrivilege",
  "atlasNetworkBoundary",
  "deploymentSecretIsolation",
  "deploymentRuntimeIsolation",
  "deployedTenantIsolation",
  "hostingerCdnWafConfiguration",
  "rollbackReadiness",
];

const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const COMMIT_RE = /^[a-f0-9]{7,40}$/;
const RUN_ID_RE = /^[A-Za-z0-9._:-]{1,160}$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const fail = (message) => {
  throw new Error(`INFRASTRUCTURE_SECURITY_ACCEPTANCE_INVALID: ${message}`);
};

const assertExactKeys = (value, allowed, label) => {
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    fail(`${label} keys must be exactly: ${expected.join(", ")}`);
  }
};

const validateEvidence = (name, evidence) => {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    fail(`${name} must be an object`);
  }

  assertExactKeys(
    evidence,
    ["status", "evidenceSha256", "repository", "commit", "runId", "recordedAt"],
    name,
  );

  if (evidence.status !== "pass") {
    fail(`${name}.status must be pass`);
  }
  if (!SHA256_RE.test(evidence.evidenceSha256)) {
    fail(`${name}.evidenceSha256 must be sha256:<64 lowercase hex>`);
  }
  if (!REPOSITORY_RE.test(evidence.repository ?? "")) {
    fail(`${name}.repository is invalid`);
  }
  if (!COMMIT_RE.test(evidence.commit ?? "")) {
    fail(`${name}.commit is invalid`);
  }
  if (!RUN_ID_RE.test(evidence.runId ?? "")) {
    fail(`${name}.runId is invalid`);
  }
  if (!ISO_UTC_RE.test(evidence.recordedAt ?? "")) {
    fail(`${name}.recordedAt must be an ISO UTC timestamp`);
  }

  return {
    status: "pass",
    evidenceSha256: evidence.evidenceSha256,
    repository: evidence.repository,
    commit: evidence.commit,
    runId: evidence.runId,
    recordedAt: evidence.recordedAt,
  };
};

export const validateInfrastructureSecurityAcceptance = (manifest) => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("manifest must be an object");
  }

  assertExactKeys(
    manifest,
    ["schemaVersion", "check", "environment", "generatedAt", "controls"],
    "manifest",
  );

  if (manifest.schemaVersion !== 1) {
    fail("schemaVersion must be 1");
  }
  if (manifest.check !== "deca-infrastructure-security") {
    fail("check must be deca-infrastructure-security");
  }
  if (manifest.environment !== "kairoseth-production") {
    fail("environment must be kairoseth-production");
  }
  if (!ISO_UTC_RE.test(manifest.generatedAt ?? "")) {
    fail("generatedAt must be an ISO UTC timestamp");
  }
  if (!manifest.controls || typeof manifest.controls !== "object" || Array.isArray(manifest.controls)) {
    fail("controls must be an object");
  }

  assertExactKeys(manifest.controls, REQUIRED_CONTROLS, "controls");

  const controls = Object.fromEntries(
    REQUIRED_CONTROLS.map((name) => [
      name,
      validateEvidence(name, manifest.controls[name]),
    ]),
  );

  return {
    schemaVersion: 1,
    check: "deca-infrastructure-security",
    environment: "kairoseth-production",
    generatedAt: manifest.generatedAt,
    allRequiredControlsPassed: true,
    controls,
  };
};

const runCli = async () => {
  const inputArg = process.argv[2] || process.env.DECA_INFRA_SECURITY_MANIFEST;
  const outputArg = process.argv[3] || process.env.DECA_INFRA_SECURITY_OUTPUT;

  if (!inputArg) {
    fail("manifest path is required as argv[2] or DECA_INFRA_SECURITY_MANIFEST");
  }

  const inputPath = resolve(inputArg);
  const parsed = JSON.parse(await readFile(inputPath, "utf8"));
  const validated = validateInfrastructureSecurityAcceptance(parsed);
  const serialized = `${JSON.stringify(validated, null, 2)}\n`;

  if (outputArg) {
    await writeFile(resolve(outputArg), serialized, { mode: 0o600 });
  }

  process.stdout.write(serialized);
};

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

if (invokedPath && import.meta.url === invokedPath) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
