import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptPath = "scripts/production/check-kairoseth-bridge-readiness.sh";
const workflowPath = ".github/workflows/kairoseth-bridge-readiness.yml";

const [script, workflow] = await Promise.all([
  readFile(scriptPath, "utf8"),
  readFile(workflowPath, "utf8"),
]);

test("Kairoseth bridge readiness probe has valid shell syntax", () => {
  const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  assert.equal(
    syntax.status,
    0,
    syntax.stderr || syntax.stdout || "bash -n failed",
  );
});

test("Kairoseth bridge readiness probe is read-only and sanitized", () => {
  assert.match(script, /\/api\/operations\/deca\/bridge-readiness/);
  assert.match(script, /--get/);
  assert.match(script, /Authorization: Bearer \$OPERATIONS_SECRET/);
  assert.doesNotMatch(
    script,
    /--request +(POST|PUT|PATCH|DELETE)|-X +(POST|PUT|PATCH|DELETE)/i,
  );
  assert.doesNotMatch(script, /cat +["']?\$result/);
  assert.match(script, /state=\$\{state\}/);
  assert.match(script, /configured === true/);
  assert.match(script, /reachable === true/);
});

test("readiness workflow reuses the protected DeCA production secret without job-scope exposure", () => {
  assert.match(workflow, /environment: deca-production/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /scripts\/production\/check-kairoseth-bridge-readiness\.sh/);

  const jobHeader = workflow.split("\n    steps:")[0] ?? workflow;
  assert.doesNotMatch(
    jobHeader,
    /OPERATIONS_HEALTH_SECRET|secrets\./,
    "operations secret must remain step-scoped",
  );
  assert.match(
    workflow,
    /OPERATIONS_HEALTH_SECRET: \$\{\{ secrets\.OPERATIONS_HEALTH_SECRET \}\}/,
  );
});
