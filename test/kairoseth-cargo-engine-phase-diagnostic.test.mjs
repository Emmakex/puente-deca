import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflowPath = new URL(
  "../.github/workflows/kairoseth-cargo-engine-phase-diagnostic.yml",
  import.meta.url,
);
const workflow = fs.readFileSync(workflowPath, "utf8");

test("engine phase diagnostic remains production-scoped and secret-safe", () => {
  assert.match(workflow, /environment:\s+deca-production/);
  assert.match(workflow, /OPERATIONS_HEALTH_SECRET/);
  assert.match(workflow, /echo \"::add-mask::\$api_key\"/);
  assert.match(workflow, /trap cleanup EXIT/);
  assert.match(workflow, /revoke_credential/);
  assert.match(workflow, /rm -rf \"\$work\"/);
  assert.match(workflow, /kairoseth-cargo-production-acceptance/);
});

test("engine phase diagnostic emits only bounded phase and HTTP metadata", () => {
  assert.match(workflow, /DECA engine acceptance phase=\$\{phase\} http=\$\{http_status\}/);
  for (const phase of [
    "fixture-http",
    "health-contract",
    "list-contract",
    "shipment-contract",
    "pdf-http",
    "header-cache-control",
    "header-csp",
    "repeat-pdf-hash",
    "credential-revoke",
  ]) {
    assert.ok(workflow.includes(`\"${phase}\"`), `missing diagnostic phase ${phase}`);
  }

  assert.doesNotMatch(workflow, /cat\s+[^\n]*(fixture|health|list|shipment|json)/i);
  const apiKeyEchoes = workflow.match(/echo\s+[^\n]*\$api_key/g) ?? [];
  assert.deepEqual(apiKeyEchoes, ['echo "::add-mask::$api_key']);
  assert.doesNotMatch(workflow, /print.*fixture_body/i);
});

test("automatic execution is bounded to changes in the temporary diagnostic workflow", () => {
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(
    workflow,
    /paths:\s*\n\s*- \.github\/workflows\/kairoseth-cargo-engine-phase-diagnostic\.yml/,
  );
});
