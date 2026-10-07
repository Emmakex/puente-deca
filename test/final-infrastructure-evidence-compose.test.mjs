import test from "node:test";
import assert from "node:assert/strict";
import { composeFinalInfrastructureAcceptance } from "../scripts/production/final-infrastructure-evidence-compose.mjs";

const gate = (seed = "a", repository = "Emmakex/puente-deca") => ({
  status: "pass",
  evidenceSha256: `sha256:${seed.repeat(64)}`,
  repository,
  commit: seed.repeat(40),
  runId: `run-${seed}`,
  recordedAt: "2026-10-07T03:00:00Z",
});

const promoted = (gateName, check, value = gate("a")) => ({
  status: "ok",
  check,
  gateName,
  gate: value,
});

const validResults = () => [
  promoted("atlasCore", "final-gate-evidence-promote", gate("a")),
  promoted("drRestore", "final-gate-evidence-promote", gate("b")),
  promoted("kairosethEngine", "final-gate-evidence-promote", gate("c", "Emmakex/kairoseth-platform")),
  promoted("hostingerEdge", "final-gate-evidence-promote", gate("d", "Emmakex/kairoseth-platform")),
  promoted("infrastructureSecurity", "infrastructure-security-evidence-promote", gate("e")),
  promoted("wooCommerceLive", "connector-live-evidence-verify", gate("f")),
  promoted("prestaShop178Live", "connector-live-evidence-verify", gate("1")),
  promoted("prestaShop8Live", "connector-live-evidence-verify", gate("2")),
];

test("composes the exact eight-gate deca-100 manifest", () => {
  const manifest = composeFinalInfrastructureAcceptance({
    results: validResults(),
    generatedAt: "2026-10-07T03:05:00Z",
  });

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.milestone, "deca-100");
  assert.equal(manifest.allRequiredGatesPassed, true);
  assert.deepEqual(Object.keys(manifest.gates), [
    "atlasCore",
    "drRestore",
    "kairosethEngine",
    "hostingerEdge",
    "infrastructureSecurity",
    "wooCommerceLive",
    "prestaShop178Live",
    "prestaShop8Live",
  ]);
});

test("rejects a duplicate gate even when eight results are supplied", () => {
  const results = validResults();
  results[7] = promoted("prestaShop178Live", "connector-live-evidence-verify", gate("2"));
  assert.throws(
    () => composeFinalInfrastructureAcceptance({ results }),
    (error) => error?.code === "FINAL_INFRA_COMPOSE_DUPLICATE_GATE",
  );
});

test("rejects a gate emitted by the wrong producer", () => {
  const results = validResults();
  results[4] = promoted("infrastructureSecurity", "final-gate-evidence-promote", gate("e"));
  assert.throws(
    () => composeFinalInfrastructureAcceptance({ results }),
    (error) => error?.code === "FINAL_INFRA_COMPOSE_PRODUCER_INVALID",
  );
});

test("rejects an invalid final gate rather than normalizing it", () => {
  const results = validResults();
  results[0] = {
    ...results[0],
    gate: { ...results[0].gate, status: "pending" },
  };
  assert.throws(
    () => composeFinalInfrastructureAcceptance({ results }),
    /atlasCore\.status must be pass/,
  );
});

test("rejects extra fields in promoted results", () => {
  const results = validResults();
  results[0] = { ...results[0], rawEvidencePath: "/tmp/private.json" };
  assert.throws(
    () => composeFinalInfrastructureAcceptance({ results }),
    (error) => error?.code === "FINAL_INFRA_COMPOSE_SHAPE_INVALID",
  );
});

test("requires exactly eight promoted results", () => {
  assert.throws(
    () => composeFinalInfrastructureAcceptance({ results: validResults().slice(0, 7) }),
    (error) => error?.code === "FINAL_INFRA_COMPOSE_GATE_COUNT_INVALID",
  );
});
