import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const REQUIRED_GATES = [
  "atlasCore",
  "drRestore",
  "kairosethEngine",
  "hostingerEdge",
  "infrastructureSecurity",
  "wooCommerceLive",
  "prestaShop178Live",
  "prestaShop8Live",
];

const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const COMMIT_RE = /^[a-f0-9]{7,40}$/;
const RUN_ID_RE = /^[A-Za-z0-9._:-]{1,160}$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const fail = (message) => {
  throw new Error(`FINAL_INFRA_ACCEPTANCE_INVALID: ${message}`);
};

const assertExactKeys = (value, allowed, label) => {
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    fail(`${label} keys must be exactly: ${expected.join(", ")}`);
  }
};

const validateGate = (name, gate) => {
  if (!gate || typeof gate !== "object" || Array.isArray(gate)) {
    fail(`${name} must be an object`);
  }

  assertExactKeys(
    gate,
    ["status", "evidenceSha256", "repository", "commit", "runId", "recordedAt"],
    name,
  );

  if (gate.status !== "pass") {
    fail(`${name}.status must be pass`);
  }
  if (!SHA256_RE.test(gate.evidenceSha256)) {
    fail(`${name}.evidenceSha256 must be sha256:<64 lowercase hex>`);
  }
  if (
    typeof gate.repository !== "string" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(gate.repository)
  ) {
    fail(`${name}.repository is invalid`);
  }
  if (typeof gate.commit !== "string" || !COMMIT_RE.test(gate.commit)) {
    fail(`${name}.commit is invalid`);
  }
  if (typeof gate.runId !== "string" || !RUN_ID_RE.test(gate.runId)) {
    fail(`${name}.runId is invalid`);
  }
  if (typeof gate.recordedAt !== "string" || !ISO_UTC_RE.test(gate.recordedAt)) {
    fail(`${name}.recordedAt must be an ISO UTC timestamp`);
  }

  return {
    status: "pass",
    evidenceSha256: gate.evidenceSha256,
    repository: gate.repository,
    commit: gate.commit,
    runId: gate.runId,
    recordedAt: gate.recordedAt,
  };
};

export const validateFinalInfrastructureAcceptance = (manifest) => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("manifest must be an object");
  }

  assertExactKeys(
    manifest,
    ["schemaVersion", "milestone", "generatedAt", "gates"],
    "manifest",
  );

  if (manifest.schemaVersion !== 1) {
    fail("schemaVersion must be 1");
  }
  if (manifest.milestone !== "deca-100") {
    fail("milestone must be deca-100");
  }
  if (
    typeof manifest.generatedAt !== "string" ||
    !ISO_UTC_RE.test(manifest.generatedAt)
  ) {
    fail("generatedAt must be an ISO UTC timestamp");
  }
  if (!manifest.gates || typeof manifest.gates !== "object" || Array.isArray(manifest.gates)) {
    fail("gates must be an object");
  }

  assertExactKeys(manifest.gates, REQUIRED_GATES, "gates");

  const gates = Object.fromEntries(
    REQUIRED_GATES.map((name) => [name, validateGate(name, manifest.gates[name])]),
  );

  return {
    schemaVersion: 1,
    milestone: "deca-100",
    generatedAt: manifest.generatedAt,
    allRequiredGatesPassed: true,
    gates,
  };
};

const runCli = async () => {
  const inputArg = process.argv[2] || process.env.DECA_INFRA_ACCEPTANCE_MANIFEST;
  const outputArg = process.argv[3] || process.env.DECA_INFRA_ACCEPTANCE_OUTPUT;

  if (!inputArg) {
    fail("manifest path is required as argv[2] or DECA_INFRA_ACCEPTANCE_MANIFEST");
  }

  const inputPath = resolve(inputArg);
  const parsed = JSON.parse(await readFile(inputPath, "utf8"));
  const validated = validateFinalInfrastructureAcceptance(parsed);
  const serialized = `${JSON.stringify(validated, null, 2)}\n`;

  if (outputArg) {
    const outputPath = resolve(outputArg);
    await writeFile(outputPath, serialized, { mode: 0o600 });
  }

  process.stdout.write(serialized);
};

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
