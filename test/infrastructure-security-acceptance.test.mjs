import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  validateInfrastructureSecurityAcceptance,
} from "../scripts/production/infrastructure-security-acceptance.mjs";

const control = (hex) => ({
  status: "pass",
  evidenceSha256: `sha256:${hex.repeat(64).slice(0, 64)}`,
  referenceId: `internal-${hex}`,
  recordedAt: "2026-10-05T12:30:00Z",
});

const valid = () => ({
  schemaVersion: 1,
  check: "deca-infrastructure-security-acceptance",
  recordedAt: "2026-10-05T12:35:00Z",
  controls: {
    atlasLeastPrivilege: control("a"),
    atlasNetworkAccess: control("b"),
    runtimeSecretScope: control("c"),
    deployedTenantIsolation: control("f"),
    deploymentReadinessRollback: control("d"),
    hostingerWafConfiguration: control("e"),
  },
});

test("infrastructure security acceptance requires all six controls", () => {
  const result = validateInfrastructureSecurityAcceptance(valid());
  assert.equal(result.status, "pass");
  assert.equal(Object.keys(result.controls).length, 6);
});

test("pending infrastructure control fails closed", () => {
  const manifest = valid();
  manifest.controls.atlasNetworkAccess.status = "pending";
  assert.throws(
    () => validateInfrastructureSecurityAcceptance(manifest),
    /atlasNetworkAccess\.status must be pass/,
  );
});

test("missing deployed tenant-isolation evidence fails closed", () => {
  const manifest = valid();
  delete manifest.controls.deployedTenantIsolation;
  assert.throws(
    () => validateInfrastructureSecurityAcceptance(manifest),
    /controls keys must be exactly/,
  );
});

test("secret-bearing fields are rejected", () => {
  const manifest = valid();
  manifest.controls.atlasLeastPrivilege.mongodbUri = "mongodb+srv://secret";
  assert.throws(
    () => validateInfrastructureSecurityAcceptance(manifest),
    /atlasLeastPrivilege keys must be exactly/,
  );
});

test("evidence hash is mandatory", () => {
  const manifest = valid();
  manifest.controls.hostingerWafConfiguration.evidenceSha256 = "missing";
  assert.throws(
    () => validateInfrastructureSecurityAcceptance(manifest),
    /hostingerWafConfiguration\.evidenceSha256/,
  );
});

test("validated evidence output is owner-only and secret-free", async () => {
  const dir = await mkdtemp(join(tmpdir(), "deca-infra-security-"));
  const input = join(dir, "manifest.json");
  const output = join(dir, "evidence.json");
  await writeFile(input, `${JSON.stringify(valid(), null, 2)}\n`, { mode: 0o600 });

  const result = spawnSync(
    process.execPath,
    ["scripts/production/infrastructure-security-acceptance.mjs", input, output],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const serialized = await readFile(output, "utf8");
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  assert.doesNotMatch(serialized, /mongodb\+srv|password|api[_-]?key|token/i);
  assert.equal(JSON.parse(serialized).status, "pass");
});
