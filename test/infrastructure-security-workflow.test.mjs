import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/infrastructure-security-acceptance.yml";

const required = [
  [/workflow_dispatch:/, "infrastructure security acceptance must be explicitly dispatched"],
  [/confirm:[\s\S]*type:\s*boolean/, "infrastructure security acceptance must require explicit confirmation"],
  [/runs-on:\s*\[self-hosted, Linux, X64, kairoseth-ci, kairoseth-platform\]/, "provider evidence must stay on the protected Kairoseth runner"],
  [/environment:\s*deca-production/, "workflow must use the protected DeCA production environment"],
  [/vars\.PDECA_INFRA_ATLAS_INSPECTION/, "Atlas inspection path must come from protected environment configuration"],
  [/vars\.PDECA_INFRA_ATLAS_ROLE_EVIDENCE/, "Atlas role evidence path must be protected configuration"],
  [/vars\.PDECA_INFRA_ATLAS_NETWORK_EVIDENCE/, "Atlas network evidence path must be protected configuration"],
  [/vars\.PDECA_INFRA_RUNTIME_SECRET_EVIDENCE/, "runtime secret evidence path must be protected configuration"],
  [/vars\.PDECA_INFRA_TENANT_EVIDENCE/, "tenant isolation evidence path must be protected configuration"],
  [/vars\.PDECA_INFRA_ROLLBACK_EVIDENCE/, "rollback evidence path must be protected configuration"],
  [/vars\.PDECA_INFRA_WAF_INSPECTION/, "WAF inspection path must be protected configuration"],
  [/vars\.PDECA_INFRA_WAF_PROVIDER_EVIDENCE/, "WAF provider evidence path must be protected configuration"],
  [/vars\.PDECA_INFRA_EDGE_EVIDENCE/, "edge evidence path must be protected configuration"],
  [/production:infrastructure-security-evidence-compose/, "workflow must use the canonical six-control composer"],
  [/production:infrastructure-security-evidence-promote/, "workflow must use the canonical infrastructureSecurity promoter"],
  [/atlasLeastPrivilege/, "workflow must assert the Atlas least-privilege control"],
  [/atlasNetworkAccess/, "workflow must assert the Atlas network-access control"],
  [/runtimeSecretScope/, "workflow must assert the runtime-secret-scope control"],
  [/deployedTenantIsolation/, "workflow must assert deployed tenant isolation"],
  [/deploymentReadinessRollback/, "workflow must assert deployment readiness and rollback"],
  [/hostingerWafConfiguration/, "workflow must assert Hostinger WAF configuration"],
  [/gateName\s*!==\s*"infrastructureSecurity"/, "workflow must bind promotion to infrastructureSecurity"],
  [/retention-days:\s*90/, "sanitized rollup evidence must be retained for audit"]
];

test("infrastructure security acceptance workflow stays provider-safe and fail-closed", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  for (const [pattern, message] of required) {
    assert.match(workflow, pattern, message);
  }

  assert.doesNotMatch(
    workflow,
    /runs-on:\s*ubuntu-(?:latest|\d)/,
    "provider evidence must never be processed on a public GitHub-hosted runner"
  );

  assert.doesNotMatch(
    workflow,
    /secrets\./,
    "this workflow must compose already-retained sanitized evidence and must not need provider credentials"
  );

  const uploadBlock = workflow.slice(workflow.indexOf("Upload only sanitized infrastructure-security rollup evidence"));
  assert.match(uploadBlock, /deca-infrastructure-security-evidence\.json/);
  assert.match(uploadBlock, /infrastructure-security-final-gate\.json/);
  assert.doesNotMatch(uploadBlock, /PDECA_INFRA_/i, "raw/provider evidence paths must not be uploaded as artifacts");
  assert.doesNotMatch(uploadBlock, /atlas-role-evidence|atlas-network-evidence|waf-provider-evidence|edge-evidence/i, "raw provider evidence must remain on the protected runner");
});
