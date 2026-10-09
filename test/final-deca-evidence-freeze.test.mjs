import test from "node:test";
import assert from "node:assert/strict";
import {
  validateFinalFreezeInputs,
} from "../scripts/production/final-deca-evidence-freeze.mjs";

const commit = "ca5e74d3000c95f098d18add72e595700cbb18bf";
const repository = "Emmakex/puente-deca";
const artifacts = [
  "dist/puente-deca-woocommerce-0.1.0.zip",
  "dist/puentedeca-prestashop-0.1.0.zip",
  "dist/SHA256SUMS",
  "dist/sbom.cdx.json",
].map((path) => ({ path }));

const releaseManifest = () => ({
  schemaVersion: 1,
  productSlug: "extensions/puente-deca",
  version: "0.1.0",
  source: { repository, commit },
  artifacts,
});

const gate = (hex) => ({
  status: "pass",
  evidenceSha256: `sha256:${hex.repeat(64).slice(0, 64)}`,
  repository,
  commit,
  runId: `run-${hex}`,
  recordedAt: "2026-10-09T07:45:00.000Z",
});

const infrastructureAcceptance = () => ({
  schemaVersion: 1,
  milestone: "deca-100",
  allRequiredGatesPassed: true,
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

test("final freeze accepts only a matching green release", () => {
  assert.equal(
    validateFinalFreezeInputs({
      releaseManifest: releaseManifest(),
      infrastructureAcceptance: infrastructureAcceptance(),
      currentCommit: commit,
    }),
    true,
  );
});

test("final freeze rejects a release from another commit", () => {
  assert.throws(
    () => validateFinalFreezeInputs({
      releaseManifest: releaseManifest(),
      infrastructureAcceptance: infrastructureAcceptance(),
      currentCommit: "1111111111111111111111111111111111111111",
    }),
    /release manifest commit must equal current git HEAD/,
  );
});

test("final freeze rejects any pending infrastructure gate", () => {
  const infra = infrastructureAcceptance();
  infra.gates.hostingerEdge.status = "pending";
  assert.throws(
    () => validateFinalFreezeInputs({ releaseManifest: releaseManifest(), infrastructureAcceptance: infra, currentCommit: commit }),
    /hostingerEdge must be pass/,
  );
});

test("final freeze rejects substituted gate names", () => {
  const infra = infrastructureAcceptance();
  delete infra.gates.atlasCore;
  infra.gates.fakeGate = gate("9");
  assert.throws(
    () => validateFinalFreezeInputs({ releaseManifest: releaseManifest(), infrastructureAcceptance: infra, currentCommit: commit }),
    /exact eight DeCA gates/,
  );
});

test("final freeze requires release ZIP, checksums and SBOM", () => {
  const release = releaseManifest();
  release.artifacts = release.artifacts.filter((entry) => entry.path !== "dist/sbom.cdx.json");
  assert.throws(
    () => validateFinalFreezeInputs({ releaseManifest: release, infrastructureAcceptance: infrastructureAcceptance(), currentCommit: commit }),
    /release artifact missing: dist\/sbom\.cdx\.json/,
  );
});

test("final freeze rejects a gate promoted from another repository", () => {
  const infra = infrastructureAcceptance();
  infra.gates.wooCommerceLive.repository = "OtherOrg/other-repo";
  assert.throws(
    () => validateFinalFreezeInputs({
      releaseManifest: releaseManifest(),
      infrastructureAcceptance: infra,
      currentCommit: commit,
    }),
    /wooCommerceLive repository must be Emmakex\/puente-deca/,
  );
});

test("final freeze rejects a stale gate promoted from another commit", () => {
  const infra = infrastructureAcceptance();
  infra.gates.prestaShop8Live.commit = "1111111111111111111111111111111111111111";
  assert.throws(
    () => validateFinalFreezeInputs({
      releaseManifest: releaseManifest(),
      infrastructureAcceptance: infra,
      currentCommit: commit,
    }),
    /prestaShop8Live commit must equal current git HEAD/,
  );
});
