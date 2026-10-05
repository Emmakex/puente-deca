import test from "node:test";
import assert from "node:assert/strict";
import {
  validateFinalInfrastructureAcceptance,
} from "../scripts/production/final-infrastructure-acceptance.mjs";

const gate = (suffix) => ({
  status: "pass",
  evidenceSha256: `sha256:${suffix.repeat(64).slice(0, 64)}`,
  repository: "Emmakex/puente-deca",
  commit: "351b02a1d64b07f0cdfca1009453a74f0ce0bb3b",
  runId: `run-${suffix}`,
  recordedAt: "2026-10-05T12:00:00Z",
});

const validManifest = () => ({
  schemaVersion: 1,
  milestone: "deca-100",
  generatedAt: "2026-10-05T12:05:00Z",
  gates: {
    atlasCore: gate("a"),
    drRestore: gate("b"),
    kairosethEngine: gate("c"),
    hostingerEdge: gate("d"),
    infrastructureSecurity: gate("e"),
    wooCommerceLive: gate("f"),
    prestaShop178Live: gate("1"),
    prestaShop8Live: gate("2"),
  },
});

test("final DeCA infrastructure manifest requires every acceptance gate", () => {
  const result = validateFinalInfrastructureAcceptance(validManifest());
  assert.equal(result.milestone, "deca-100");
  assert.equal(result.allRequiredGatesPassed, true);
  assert.equal(Object.keys(result.gates).length, 8);
});

test("final DeCA infrastructure manifest fails closed for a pending gate", () => {
  const manifest = validManifest();
  manifest.gates.hostingerEdge.status = "pending";
  assert.throws(
    () => validateFinalInfrastructureAcceptance(manifest),
    /hostingerEdge\.status must be pass/,
  );
});

test("final DeCA infrastructure manifest rejects missing gates", () => {
  const manifest = validManifest();
  delete manifest.gates.drRestore;
  assert.throws(
    () => validateFinalInfrastructureAcceptance(manifest),
    /gates keys must be exactly/,
  );
});

test("final DeCA infrastructure manifest rejects secret-bearing extra fields", () => {
  const manifest = validManifest();
  manifest.gates.kairosethEngine.apiKey = "must-never-be-accepted";
  assert.throws(
    () => validateFinalInfrastructureAcceptance(manifest),
    /kairosethEngine keys must be exactly/,
  );
});

test("final DeCA infrastructure manifest requires evidence hashes", () => {
  const manifest = validManifest();
  manifest.gates.atlasCore.evidenceSha256 = "not-a-hash";
  assert.throws(
    () => validateFinalInfrastructureAcceptance(manifest),
    /atlasCore\.evidenceSha256/,
  );
});
