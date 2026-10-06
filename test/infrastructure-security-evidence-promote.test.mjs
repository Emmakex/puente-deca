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
      const input =
        join(directory, "input.json");
      const validated =
        join(
          directory,
          "validated.json"
        );

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

      const bytes =
        await readFile(validated);
      const digest =
        createHash("sha256")
          .update(bytes)
          .digest("hex");

      const promotion = spawnSync(
        process.execPath,
        [
          "scripts/production/infrastructure-security-evidence-promote.mjs",
          validated
        ],
        { encoding: "utf8" }
      );
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
      assert.equal(
        output.gate.status,
        "pass"
      );
      assert.equal(
        output.gate.evidenceSha256,
        `sha256:${digest}`
      );
      assert.equal(
        output.gate.repository,
        "Emmakex/puente-deca"
      );
      assert.match(
        output.gate.commit,
        /^[a-f0-9]{40}$/
      );
      assert.equal(
        output.gate.runId,
        `infra-security-${digest.slice(0, 32)}`
      );
      assert.equal(
        output.gate.recordedAt,
        manifest().recordedAt
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
  "refuses to promote incomplete infrastructure security evidence",
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
        join(
          directory,
          "invalid.json"
        );
      const invalid =
        manifest();
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

      const promotion = spawnSync(
        process.execPath,
        [
          "scripts/production/infrastructure-security-evidence-promote.mjs",
          path
        ],
        { encoding: "utf8" }
      );

      assert.notEqual(
        promotion.status,
        0
      );
      assert.match(
        promotion.stderr,
        /INFRA_SECURITY_EVIDENCE_PROMOTION_FAILED/
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
