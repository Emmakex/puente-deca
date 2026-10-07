import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { composeFinalInfrastructureAcceptance } from "./final-infrastructure-evidence-compose.mjs";

const REQUIRED_GATE_COUNT = 8;
const REPOSITORY = "Emmakex/puente-deca";
const MILESTONE = "deca-100-final-freeze";

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

export const parseFinalAcceptanceArgs = (argv) => {
  const gateResultPaths = [];
  let outputDir = ".artifacts/deca-final";
  let outputDirSeen = false;

  for (const arg of argv) {
    if (arg.startsWith("--gate-result=")) {
      const value = arg.slice("--gate-result=".length).trim();
      if (!value) {
        fail("FINAL_DECA_GATE_PATH_INVALID", "--gate-result requires a non-empty path");
      }
      gateResultPaths.push(value);
      continue;
    }

    if (arg.startsWith("--output-dir=")) {
      if (outputDirSeen) {
        fail("FINAL_DECA_OUTPUT_DIR_DUPLICATE", "--output-dir may be supplied only once");
      }
      const value = arg.slice("--output-dir=".length).trim();
      if (!value) {
        fail("FINAL_DECA_OUTPUT_DIR_INVALID", "--output-dir requires a non-empty path");
      }
      outputDir = value;
      outputDirSeen = true;
      continue;
    }

    fail("FINAL_DECA_ARGUMENT_INVALID", `Unexpected argument: ${arg}`);
  }

  if (gateResultPaths.length !== REQUIRED_GATE_COUNT) {
    fail(
      "FINAL_DECA_GATE_COUNT_INVALID",
      `Exactly ${REQUIRED_GATE_COUNT} --gate-result=<path> arguments are required`,
    );
  }

  return { gateResultPaths, outputDir };
};

const sha256 = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const runStep = (label, command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 2_000_000,
    ...options,
  });

  if (result.error || result.status !== 0) {
    fail(
      "FINAL_DECA_STEP_FAILED",
      `${label} failed`,
    );
  }
};

const currentCommit = () => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    maxBuffer: 100_000,
  });
  const commit = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !/^[a-f0-9]{40}$/.test(commit)) {
    fail("FINAL_DECA_COMMIT_UNAVAILABLE", "Exact git HEAD is required");
  }
  return commit;
};

const loadPromotedResults = async (paths) =>
  Promise.all(
    paths.map(async (path, index) => {
      const bytes = await readFile(resolve(path));
      if (bytes.length === 0 || bytes.length > 1024 * 1024) {
        fail("FINAL_DECA_GATE_FILE_SIZE_INVALID", `Gate result ${index} has invalid size`);
      }
      try {
        return JSON.parse(bytes.toString("utf8"));
      } catch {
        fail("FINAL_DECA_GATE_JSON_INVALID", `Gate result ${index} is not valid JSON`);
      }
    }),
  );

const validateFreeze = (freeze, commit) => {
  if (
    freeze?.schemaVersion !== 1 ||
    freeze?.milestone !== MILESTONE ||
    freeze?.repository !== REPOSITORY ||
    freeze?.commit !== commit ||
    freeze?.allRequiredGatesPassed !== true ||
    !/^sha256:[a-f0-9]{64}$/.test(String(freeze?.releaseManifestSha256 ?? "")) ||
    !/^sha256:[a-f0-9]{64}$/.test(String(freeze?.infrastructureAcceptanceSha256 ?? ""))
  ) {
    fail("FINAL_DECA_FREEZE_RESULT_INVALID", "Final freeze result is not completion-grade");
  }
};

const runCli = async () => {
  try {
    const { gateResultPaths, outputDir } = parseFinalAcceptanceArgs(process.argv.slice(2));
    const commit = currentCommit();
    const results = await loadPromotedResults(gateResultPaths);

    // Canonical composition happens before any release artifact is built. If a gate is
    // missing, malformed, duplicated or not pass, the entire close-out fails here.
    const infrastructureAcceptance = composeFinalInfrastructureAcceptance({ results });

    const finalDir = resolve(outputDir);
    const infrastructurePath = resolve(finalDir, "deca-final-infrastructure-evidence.json");
    const freezePath = resolve(finalDir, "deca-final-release-evidence.json");
    const summaryPath = resolve(finalDir, "deca-final-acceptance-summary.json");

    await mkdir(finalDir, { recursive: true, mode: 0o700 });
    const infrastructureBytes = Buffer.from(
      `${JSON.stringify(infrastructureAcceptance, null, 2)}\n`,
      "utf8",
    );
    await writeFile(infrastructurePath, infrastructureBytes, { mode: 0o600 });

    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    runStep("connector packaging", npm, ["run", "release:connectors"]);
    runStep("SBOM generation", npm, ["run", "release:sbom"]);
    runStep("release manifest generation", npm, ["run", "release:manifest"]);
    runStep("release manifest verification", npm, ["run", "release:verify"]);
    runStep("connector checksum verification", "sha256sum", ["--check", "SHA256SUMS"], {
      cwd: resolve("dist"),
    });

    runStep(
      "final evidence freeze",
      process.execPath,
      [
        "scripts/production/final-deca-evidence-freeze.mjs",
        "dist/release-manifest.json",
        infrastructurePath,
        freezePath,
      ],
    );

    const freezeBytes = await readFile(freezePath);
    let freeze;
    try {
      freeze = JSON.parse(freezeBytes.toString("utf8"));
    } catch {
      fail("FINAL_DECA_FREEZE_JSON_INVALID", "Final freeze output is not valid JSON");
    }
    validateFreeze(freeze, commit);

    const summary = {
      status: "ok",
      check: "deca-final-acceptance",
      milestone: MILESTONE,
      repository: REPOSITORY,
      commit,
      allRequiredGatesPassed: true,
      infrastructureAcceptanceSha256: sha256(infrastructureBytes),
      finalFreezeSha256: sha256(freezeBytes),
      frozenAt: freeze.frozenAt,
    };

    await writeFile(
      summaryPath,
      `${JSON.stringify(summary, null, 2)}\n`,
      { mode: 0o600 },
    );

    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        check: "deca-final-acceptance",
        code: typeof error?.code === "string" ? error.code : "FINAL_DECA_ACCEPTANCE_FAILED",
      })}\n`,
    );
    process.exitCode = 1;
  }
};

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invoked && import.meta.url === invoked) await runCli();
