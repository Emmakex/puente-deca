import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const control = (hex) => ({
  status: "pass",
  evidenceSha256:
    `sha256:${hex.repeat(64).slice(0, 64)}`,
  referenceId:
    `internal-${hex}`,
  recordedAt:
    "2026-10-06T18:30:00Z"
});

const manifest = () => ({
  schemaVersion: 1,
  check:
    "deca-infrastructure-security-acceptance",
  recordedAt:
    "2026-10-06T18:35:00Z",
  controls: {
    atlasLeastPrivilege:
      control("a"),
    atlasNetworkAccess:
      control("b"),
    runtimeSecretScope:
      control("c"),
    deployedTenantIsolation:
      control("d"),
    deploymentReadinessRollback:
      control("e"),
    hostingerWafConfiguration:
      control("f")
  }
});

const validateToFile = async (
  directory
) => {
  const input =
    join(directory, "input.json");
  const validated =
    join(directory, "validated.json");

  await writeFile(
    input,
    `${JSON.stringify(
      manifest(),
      null,
      2
    )}\n`,
    "utf8"
  );

  const acceptance = spawnSync(
    process.execPath,
    [
      "scripts/production/infrastructure-security-acceptance.mjs",
      input,
      validated
    ],
    { encoding: "utf8" }
  );

  assert.equal(
    acceptance.status,
    0,
    acceptance.stderr
  );

  return validated;
};

const promote = (path) =>
  spawnSync(
    process.execPath,
    [
      "scripts/production/infrastructure-security-evidence-promote.mjs",
      path
    ],
    { encoding: "utf8" }
  );

test(
  "promotes validated infrastructure security evidence to the exact final gate shape",
  async () => {
    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "pdeca-infra-promotion-"
        )
      );

    try {
      const validated =
        await validateToFile(
          directory
        );
      const bytes =
        await readFile(validated);
      const digest =
        createHash("sha256")
          .update(bytes)
          .digest("hex");

      const promotion =
        promote(validated);

      assert.equal(
        promotion.status,
        0,
        promotion.stderr
      );

      const output = JSON.parse(
        promotion.stdout
      );

      assert.equal(
        output.gateName,
        "infrastructureSecurity"
      );
      assert.deepEqual(
        output.gate,
        {
          status: "pass",
          evidenceSha256:
            `sha256:${digest}`,
          repository:
            "Emmakex/puente-deca",
          commit:
            output.gate.commit,
          runId:
            `infra-security-${digest.slice(0, 32)}`,
          recordedAt:
            manifest().recordedAt
        }
      );
      assert.match(
        output.gate.commit,
        /^[a-f0-9]{40}$/
      );
      assert.deepEqual(
        Object.keys(output.gate).sort(),
        [
          "commit",
          "evidenceSha256",
          "recordedAt",
          "repository",
          "runId",
          "status"
        ].sort()
      );
    } finally {
      await rm(
        directory,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "refuses an unvalidated or incomplete infrastructure security bundle",
  async () => {
    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "pdeca-infra-promotion-"
        )
      );

    try {
      const path =
        join(directory, "invalid.json");
      const invalid = manifest();
      delete invalid.controls
        .hostingerWafConfiguration;

      await writeFile(
        path,
        `${JSON.stringify(
          invalid,
          null,
          2
        )}\n`,
        "utf8"
      );

      const promotion = promote(path);

      assert.notEqual(
        promotion.status,
        0
      );
      assert.match(
        promotion.stderr,
        /INFRA_SECURITY_EVIDENCE_SHAPE_INVALID/
      );
    } finally {
      await rm(
        directory,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "refuses extra fields added after infrastructure security validation",
  async () => {
    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "pdeca-infra-promotion-"
        )
      );

    try {
      const validated =
        await validateToFile(
          directory
        );
      const parsed = JSON.parse(
        await readFile(
          validated,
          "utf8"
        )
      );
      parsed.providerToken =
        "must-never-be-promoted";

      await writeFile(
        validated,
        `${JSON.stringify(
          parsed,
          null,
          2
        )}\n`,
        "utf8"
      );

      const promotion =
        promote(validated);

      assert.notEqual(
        promotion.status,
        0
      );
      assert.match(
        promotion.stderr,
        /INFRA_SECURITY_EVIDENCE_SHAPE_INVALID/
      );
    } finally {
      await rm(
        directory,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "refuses retained evidence whose status is no longer pass",
  async () => {
    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "pdeca-infra-promotion-"
        )
      );

    try {
      const validated =
        await validateToFile(
          directory
        );
      const parsed = JSON.parse(
        await readFile(
          validated,
          "utf8"
        )
      );
      parsed.status = "pending";

      await writeFile(
        validated,
        `${JSON.stringify(
          parsed,
          null,
          2
        )}\n`,
        "utf8"
      );

      const promotion =
        promote(validated);

      assert.notEqual(
        promotion.status,
        0
      );
      assert.match(
        promotion.stderr,
        /INFRA_SECURITY_EVIDENCE_SHAPE_INVALID/
      );
    } finally {
      await rm(
        directory,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);
