import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateFinalInfrastructureAcceptance } from "./final-infrastructure-acceptance.mjs";

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

const EXPECTED_PRODUCERS = {
  atlasCore: "final-gate-evidence-promote",
  drRestore: "final-gate-evidence-promote",
  kairosethEngine: "final-gate-evidence-promote",
  hostingerEdge: "final-gate-evidence-promote",
  infrastructureSecurity: "infrastructure-security-evidence-promote",
  wooCommerceLive: "connector-live-evidence-verify",
  prestaShop178Live: "connector-live-evidence-verify",
  prestaShop8Live: "connector-live-evidence-verify",
};

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("FINAL_INFRA_COMPOSE_SHAPE_INVALID", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || !actual.every((key, index) => key === wanted[index])) {
    fail("FINAL_INFRA_COMPOSE_SHAPE_INVALID", `${label} keys must be exactly: ${wanted.join(", ")}`);
  }
};

export const composeFinalInfrastructureAcceptance = ({ results, generatedAt = new Date().toISOString() }) => {
  if (!Array.isArray(results) || results.length !== REQUIRED_GATES.length) {
    fail("FINAL_INFRA_COMPOSE_GATE_COUNT_INVALID", `Exactly ${REQUIRED_GATES.length} promoted gate results are required`);
  }
  if (!ISO_UTC_RE.test(generatedAt)) {
    fail("FINAL_INFRA_COMPOSE_TIMESTAMP_INVALID", "generatedAt must be an ISO UTC timestamp");
  }

  const gates = {};

  for (const [index, result] of results.entries()) {
    exactKeys(result, ["status", "check", "gateName", "gate"], `result[${index}]`);
    if (result.status !== "ok") {
      fail("FINAL_INFRA_COMPOSE_RESULT_INVALID", `result[${index}] is not ok`);
    }
    if (!REQUIRED_GATES.includes(result.gateName)) {
      fail("FINAL_INFRA_COMPOSE_GATE_NAME_INVALID", `Unsupported gateName: ${String(result.gateName)}`);
    }
    if (Object.hasOwn(gates, result.gateName)) {
      fail("FINAL_INFRA_COMPOSE_DUPLICATE_GATE", `Duplicate promoted gate: ${result.gateName}`);
    }
    if (result.check !== EXPECTED_PRODUCERS[result.gateName]) {
      fail(
        "FINAL_INFRA_COMPOSE_PRODUCER_INVALID",
        `${result.gateName} must come from ${EXPECTED_PRODUCERS[result.gateName]}`,
      );
    }
    gates[result.gateName] = result.gate;
  }

  for (const name of REQUIRED_GATES) {
    if (!Object.hasOwn(gates, name)) {
      fail("FINAL_INFRA_COMPOSE_GATE_MISSING", `Missing promoted gate: ${name}`);
    }
  }

  return validateFinalInfrastructureAcceptance({
    schemaVersion: 1,
    milestone: "deca-100",
    generatedAt,
    gates,
  });
};

const parseArgs = (argv) => {
  const gateResultPaths = [];
  let outputPath = null;
  for (const arg of argv) {
    if (arg.startsWith("--gate-result=")) {
      gateResultPaths.push(arg.slice("--gate-result=".length));
    } else if (arg.startsWith("--output=")) {
      if (outputPath) fail("FINAL_INFRA_COMPOSE_ARGUMENT_INVALID", "--output may be supplied only once");
      outputPath = arg.slice("--output=".length);
    } else {
      fail("FINAL_INFRA_COMPOSE_ARGUMENT_INVALID", `Unexpected argument: ${arg}`);
    }
  }
  return { gateResultPaths, outputPath };
};

const runCli = async () => {
  try {
    const { gateResultPaths, outputPath } = parseArgs(process.argv.slice(2));
    if (gateResultPaths.length !== REQUIRED_GATES.length) {
      fail(
        "FINAL_INFRA_COMPOSE_GATE_COUNT_INVALID",
        `Supply exactly ${REQUIRED_GATES.length} --gate-result=<path> arguments`,
      );
    }

    const results = await Promise.all(
      gateResultPaths.map(async (path, index) => {
        const bytes = await readFile(resolve(path));
        if (bytes.length === 0 || bytes.length > 1024 * 1024) {
          fail("FINAL_INFRA_COMPOSE_INPUT_SIZE_INVALID", `gate result ${index} has invalid size`);
        }
        try {
          return JSON.parse(bytes.toString("utf8"));
        } catch {
          fail("FINAL_INFRA_COMPOSE_JSON_INVALID", `gate result ${index} is not valid JSON`);
        }
      }),
    );

    const manifest = composeFinalInfrastructureAcceptance({ results });
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
    if (outputPath) {
      await writeFile(resolve(outputPath), serialized, { mode: 0o600 });
    }
    process.stdout.write(serialized);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: "error",
      check: "final-infrastructure-evidence-compose",
      code: typeof error?.code === "string" ? error.code : "FINAL_INFRA_COMPOSE_FAILED",
    })}\n`);
    process.exitCode = 1;
  }
};

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invoked && import.meta.url === invoked) await runCli();
