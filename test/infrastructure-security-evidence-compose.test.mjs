import assert from "node:assert/strict";
import test from "node:test";
import { composeInfrastructureSecurityAcceptance } from "../scripts/production/infrastructure-security-evidence-compose.mjs";

const control = (referenceId, recordedAt = "2026-10-06T20:00:00Z") => ({
  status: "pass",
  evidenceSha256: `sha256:${"a".repeat(64)}`,
  referenceId,
  recordedAt,
});

const validResults = () => ({
  atlasRuntimeResult: {
    status: "ok",
    check: "atlas-runtime-security-evidence-verify",
    source: { inspectionSha256: `sha256:${"b".repeat(64)}` },
    controls: {
      atlasLeastPrivilege: control("atlas-role", "2026-10-06T20:00:01Z"),
      atlasNetworkAccess: control("atlas-network", "2026-10-06T20:00:02Z"),
      runtimeSecretScope: control("runtime-secrets", "2026-10-06T20:00:03Z"),
    },
  },
  tenantIsolationResult: {
    status: "ok",
    check: "deployed-tenant-isolation-evidence-verify",
    controlName: "deployedTenantIsolation",
    source: { repository: "Emmakex/kairoseth-platform" },
    control: control("tenant-isolation", "2026-10-06T20:00:04Z"),
  },
  rollbackResult: {
    status: "ok",
    check: "deployment-readiness-rollback-evidence-verify",
    controlName: "deploymentReadinessRollback",
    source: { repository: "Emmakex/kairoseth-platform" },
    control: control("rollback", "2026-10-06T20:00:05Z"),
  },
  hostingerWafResult: {
    status: "ok",
    check: "hostinger-waf-configuration-evidence-verify",
    controlName: "hostingerWafConfiguration",
    source: { provider: "Hostinger" },
    control: control("hostinger-waf", "2026-10-06T20:00:06Z"),
  },
});

const expectCode = (mutator, code) => {
  const results = validResults();
  mutator(results);
  assert.throws(
    () => composeInfrastructureSecurityAcceptance(results),
    (error) => error?.code === code,
  );
};

test("composes the exact six-control infrastructure security bundle", () => {
  const result = composeInfrastructureSecurityAcceptance(validResults());
  assert.equal(result.status, "pass");
  assert.equal(result.check, "deca-infrastructure-security-acceptance");
  assert.equal(result.recordedAt, "2026-10-06T20:00:06.000Z");
  assert.deepEqual(Object.keys(result.controls).sort(), [
    "atlasLeastPrivilege",
    "atlasNetworkAccess",
    "deployedTenantIsolation",
    "deploymentReadinessRollback",
    "hostingerWafConfiguration",
    "runtimeSecretScope",
  ]);
  for (const value of Object.values(result.controls)) {
    assert.deepEqual(Object.keys(value).sort(), [
      "evidenceSha256",
      "recordedAt",
      "referenceId",
      "status",
    ]);
  }
});

test("rejects a mismatched single-control verifier name", () => {
  expectCode(
    (results) => {
      results.rollbackResult.controlName = "deployedTenantIsolation";
    },
    "INFRA_SECURITY_COMPOSE_SOURCE_INVALID",
  );
});

test("rejects a mismatched verifier check", () => {
  expectCode(
    (results) => {
      results.tenantIsolationResult.check = "wrong-check";
    },
    "INFRA_SECURITY_COMPOSE_SOURCE_INVALID",
  );
});

test("rejects missing Atlas/runtime controls", () => {
  expectCode(
    (results) => {
      delete results.atlasRuntimeResult.controls.runtimeSecretScope;
    },
    "INFRA_SECURITY_COMPOSE_SHAPE_INVALID",
  );
});

test("rejects extra Atlas/runtime controls", () => {
  expectCode(
    (results) => {
      results.atlasRuntimeResult.controls.extra = control("extra");
    },
    "INFRA_SECURITY_COMPOSE_SHAPE_INVALID",
  );
});

test("rejects a non-pass control", () => {
  expectCode(
    (results) => {
      results.hostingerWafResult.control.status = "pending";
    },
    "INFRA_SECURITY_COMPOSE_CONTROL_INVALID",
  );
});

test("rejects extra fields in a promoted control", () => {
  expectCode(
    (results) => {
      results.tenantIsolationResult.control.secret = "must-not-pass";
    },
    "INFRA_SECURITY_COMPOSE_SHAPE_INVALID",
  );
});

test("rejects an invalid control timestamp before canonical promotion", () => {
  expectCode(
    (results) => {
      results.atlasRuntimeResult.controls.atlasNetworkAccess.recordedAt = "not-a-date";
    },
    "INFRA_SECURITY_COMPOSE_TIMESTAMP_INVALID",
  );
});
