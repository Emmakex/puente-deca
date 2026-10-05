import test from "node:test";
import assert from "node:assert/strict";
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
    deploymentReadinessRollback: control("d"),
    hostingerWafConfiguration: control("e"),
  },
});

test("infrastructure security acceptance requires all five controls", () => {
  const result = validateInfrastructureSecurityAcceptance(valid());
  assert.equal(result.status, "pass");
  assert.equal(Object.keys(result.controls).length, 5);
});

test("pending infrastructure control fails closed", () => {
  const manifest = valid();
  manifest.controls.atlasNetworkAccess.status = "pending";
  assert.throws(
    () => validateInfrastructureSecurityAcceptance(manifest),
    /atlasNetworkAccess\.status must be pass/,
  );
});

test("missing infrastructure control fails closed", () => {
  const manifest = valid();
  delete manifest.controls.deploymentReadinessRollback;
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
