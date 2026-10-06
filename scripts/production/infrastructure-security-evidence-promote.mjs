import {
  createHash
} from "node:crypto";
import {
  readFile
} from "node:fs/promises";
import {
  resolve
} from "node:path";
import {
  spawnSync
} from "node:child_process";
import {
  validateInfrastructureSecurityAcceptance
} from "./infrastructure-security-acceptance.mjs";

const fail = (
  code,
  message
) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const exactKeys = (
  value,
  expected
) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();

  return (
    actual.length === wanted.length &&
    actual.every(
      (key, index) =>
        key === wanted[index]
    )
  );
};

try {
  const input =
    process.argv[2] ||
    process.env
      .DECA_INFRA_SECURITY_EVIDENCE;

  if (!input) {
    fail(
      "INFRA_SECURITY_EVIDENCE_REQUIRED",
      "Validated infrastructure-security evidence path is required"
    );
  }

  const evidencePath =
    resolve(input);
  const bytes =
    await readFile(evidencePath);
  let parsed;

  try {
    parsed = JSON.parse(
      bytes.toString("utf8")
    );
  } catch {
    fail(
      "INFRA_SECURITY_EVIDENCE_JSON_INVALID",
      "Infrastructure-security evidence is not valid JSON"
    );
  }

  if (
    !exactKeys(
      parsed,
      [
        "schemaVersion",
        "check",
        "recordedAt",
        "controls",
        "status"
      ]
    ) ||
    parsed.status !== "pass"
  ) {
    fail(
      "INFRA_SECURITY_EVIDENCE_SHAPE_INVALID",
      "Retained infrastructure-security evidence must be the exact validated pass bundle"
    );
  }

  const {
    status: retainedStatus,
    ...sourceManifest
  } = parsed;

  let validated;

  try {
    validated =
      validateInfrastructureSecurityAcceptance(
        sourceManifest
      );
  } catch {
    fail(
      "INFRA_SECURITY_EVIDENCE_NOT_GREEN",
      "Infrastructure-security evidence no longer validates as a complete pass bundle"
    );
  }

  if (
    retainedStatus !== "pass" ||
    validated.status !== "pass"
  ) {
    fail(
      "INFRA_SECURITY_EVIDENCE_NOT_GREEN",
      "Infrastructure-security evidence did not validate as pass"
    );
  }

  const git = spawnSync(
    "git",
    ["rev-parse", "HEAD"],
    { encoding: "utf8" }
  );
  const commit =
    (git.stdout || "").trim();

  if (
    git.status !== 0 ||
    !/^[a-f0-9]{40}$/.test(
      commit
    )
  ) {
    fail(
      "SOURCE_COMMIT_UNAVAILABLE",
      "An exact repository checkout is required"
    );
  }

  const digest =
    createHash("sha256")
      .update(bytes)
      .digest("hex");

  const gate = {
    status: "pass",
    evidenceSha256:
      `sha256:${digest}`,
    repository:
      "Emmakex/puente-deca",
    commit,
    runId:
      `infra-security-${digest.slice(0, 32)}`,
    recordedAt:
      validated.recordedAt
  };

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          "infrastructure-security-evidence-promote",
        gateName:
          "infrastructureSecurity",
        gate
      },
      null,
      2
    )}\n`
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check:
        "infrastructure-security-evidence-promote",
      code:
        typeof error?.code ===
          "string"
          ? error.code
          : "INFRA_SECURITY_EVIDENCE_PROMOTION_FAILED"
    })}\n`
  );
  process.exitCode = 1;
}
