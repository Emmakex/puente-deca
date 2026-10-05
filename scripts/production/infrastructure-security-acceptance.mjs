import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_CONTROLS = [
  "atlasLeastPrivilege",
  "atlasNetworkAccess",
  "runtimeSecretScope",
  "deployedTenantIsolation",
  "deploymentReadinessRollback",
  "hostingerWafConfiguration",
];

const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const ISO_UTC_RE = /^\d{4}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const REF_RE = /^[A-Za-z0-9._:-]{1,160}$/;

const fail = (message) => {
  throw new Error(`INFRA_SECURITY_ACCEPTANCE_INVALID: ${message}`);
};

const exactKeys = (value, allowed, label) => {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} keys must be exactly: ${expected.join(", ")}`);
  }
};

const validateControl = (name, value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${name} must be an object`);
  }
  exactKeys(value, ["status", "evidenceSha256", "referenceId", "recordedAt"], name);
  if (value.status !== "pass") fail(`${name}.status must be pass`);
  if (!SHA256_RE.test(value.evidenceSha256)) {
    fail(`${name}.evidenceSha256 must be sha256:<64 lowercase hex>`);
  }
  if (typeof value.referenceId !== "string" || !REF_RE.test(value.referenceId)) {
    fail(`${name}.referenceId is invalid`);
  }
  if (typeof value.recordedAt !== "string" || !ISO_UTC_RE.test(value.recordedAt)) {
    fail(`${name}.recordedAt must be an ISO UTC timestamp`);
  }
  return {
    status: "pass",
    evidenceSha256: value.evidenceSha256,
    referenceId: value.referenceId,
    recordedAt: value.recordedAt,
  };
};

export const validateInfrastructureSecurityAcceptance = (manifest) => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("manifest must be an object");
  }
  exactKeys(manifest, ["schemaVersion", "check", "recordedAt", "controls"], "manifest");
  if (manifest.schemaVersion !== 1) fail("schemaVersion must be 1");
  if (manifest.check !== "deca-infrastructure-security-acceptance") {
    fail("check must be deca-infrastructure-security-acceptance");
  }
  if (typeof manifest.recordedAt !== "string" || !ISO_UTC_RE.test(manifest.recordedAt)) {
    fail("recordedAt must be an ISO UTC timestamp");
  }
  if (!manifest.controls || typeof manifest.controls !== "object" || Array.isArray(manifest.controls)) {
    fail("controls must be an object");
  }
  exactKeys(manifest.controls, REQUIRED_CONTROLS, "controls");

  const controls = Object.fromEntries(
    REQUIRED_CONTROLS.map((name) => [name, validateControl(name, manifest.controls[name])]),
  );

  return {
    schemaVersion: 1,
    check: "deca-infrastructure-security-acceptance",
    recordedAt: manifest.recordedAt,
    status: "pass",
    controls,
  };
};

const runCli = async () => {
  const input = process.argv[2] || process.env.DECA_INFRA_SECURITY_MANIFEST;
  const output = process.argv[3] || process.env.DECA_INFRA_SECURITY_OUTPUT;
  if (!input) fail("manifest path is required");
  const validated = validateInfrastructureSecurityAcceptance(
    JSON.parse(await readFile(resolve(input), "utf8")),
  );
  const serialized = `${JSON.stringify(validated, null, 2)}\n`;
  if (output) await writeFile(resolve(output), serialized, { mode: 0o600 });
  process.stdout.write(serialized);
};

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invoked && import.meta.url === invoked) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
