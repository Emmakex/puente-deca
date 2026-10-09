import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/final-deca-acceptance.yml";

const gateVars = [
  "PDECA_GATE_ATLAS_CORE",
  "PDECA_GATE_DR_RESTORE",
  "PDECA_GATE_KAIROSETH_ENGINE",
  "PDECA_GATE_HOSTINGER_EDGE",
  "PDECA_GATE_INFRASTRUCTURE_SECURITY",
  "PDECA_GATE_WOOCOMMERCE_LIVE",
  "PDECA_GATE_PRESTASHOP_178_LIVE",
  "PDECA_GATE_PRESTASHOP_8_LIVE",
];

const gateNames = [
  "atlasCore",
  "drRestore",
  "kairosethEngine",
  "hostingerEdge",
  "infrastructureSecurity",
  "wooCommerceLive",
  "prestaShop178Live",
  "prestaShop8Live",
];

test("final DeCA acceptance workflow stays exact, protected, and fail-closed", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /confirm:[\s\S]*type:\s*boolean/);
  assert.match(
    workflow,
    /runs-on:\s*\[self-hosted, Linux, X64, kairoseth-ci, kairoseth-platform\]/,
    "final freeze must run on the protected Kairoseth runner",
  );
  assert.match(workflow, /environment:\s*deca-production/);
  assert.doesNotMatch(
    workflow,
    /runs-on:\s*ubuntu-(?:latest|\d)/,
    "final freeze must not move to a public GitHub-hosted runner",
  );
  assert.doesNotMatch(workflow, /secrets\./, "final freeze consumes promoted gate files, not provider credentials");

  for (const variable of gateVars) {
    assert.match(workflow, new RegExp(`vars\\.${variable}`), `${variable} must come from protected environment configuration`);
    assert.match(workflow, new RegExp(`--gate-result=\\$${variable}`), `${variable} must be passed to the canonical close-out`);
  }

  for (const gateName of gateNames) {
    assert.match(workflow, new RegExp(`['\"]${gateName}['\"]`), `${gateName} identity must be checked before freeze`);
  }

  const gateResultArgs = workflow.match(/--gate-result=/g) ?? [];
  assert.equal(gateResultArgs.length, 8, "canonical close-out must receive exactly eight promoted gate results");

  assert.match(workflow, /scripts\/production\/final-deca-acceptance\.mjs/);
  assert.match(workflow, /deca-100-final-freeze/g);
  assert.match(workflow, /summary\.commit\s*!==\s*expectedCommit/);
  assert.match(workflow, /freeze\.commit\s*!==\s*expectedCommit/);
  assert.match(workflow, /retention-days:\s*90/);

  assert.doesNotMatch(workflow, /--force|--skip-checks|--bypass|--allow-pending/);
  assert.doesNotMatch(workflow, /ecmr|efti/i, "DeCA final freeze must not expand into eCMR/eFTI scope");

  const uploadBlock = workflow.slice(workflow.indexOf("Upload sanitized final freeze and deterministic release bundle"));
  assert.match(uploadBlock, /deca-final-infrastructure-evidence\.json/);
  assert.match(uploadBlock, /deca-final-release-evidence\.json/);
  assert.match(uploadBlock, /deca-final-acceptance-summary\.json/);
  assert.match(uploadBlock, /release-manifest\.json/);
  assert.doesNotMatch(uploadBlock, /PDECA_GATE_/, "individual gate source paths must not be uploaded");
});
