import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/connector-live-acceptance.yml";

const required = [
  [
    /workflow_dispatch:/,
    "live acceptance must be explicitly dispatched"
  ],
  [
    /confirm:[\s\S]*type:\s*boolean/,
    "live acceptance must require an explicit boolean confirmation"
  ],
  [
    /target:[\s\S]*woocommerce[\s\S]*prestashop178[\s\S]*prestashop8/,
    "workflow must expose the three completion connector gates"
  ],
  [
    /runs-on:\s*\[self-hosted, Linux, X64, kairoseth-ci, kairoseth-platform\]/,
    "live acceptance must stay on the protected Kairoseth runner"
  ],
  [
    /environment:\s*deca-production/g,
    "live acceptance jobs must use the protected production environment"
  ],
  [
    /vars\.PDECA_WOO_ACCEPTANCE_ROOT/,
    "WooCommerce acceptance root must come from protected environment configuration"
  ],
  [
    /vars\.PDECA_PRESTASHOP_178_ACCEPTANCE_ROOT/,
    "PrestaShop 1.7.8 acceptance root must come from protected environment configuration"
  ],
  [
    /vars\.PDECA_PRESTASHOP_8_ACCEPTANCE_ROOT/,
    "PrestaShop 8 acceptance root must come from protected environment configuration"
  ],
  [
    /secrets\.PDECA_ACCEPTANCE_API_KEY/g,
    "live connector credential must come from a protected secret"
  ],
  [
    /PDECA_ACCEPTANCE_DATA_CLASS:\s*synthetic/g,
    "completion acceptance must be explicitly synthetic"
  ],
  [
    /PDECA_ACCEPTANCE_ENVIRONMENT:\s*kairoseth-controlled/g,
    "completion acceptance must be explicitly Kairoseth-controlled"
  ],
  [
    /woocommerce-live-acceptance-fixture\.php/,
    "WooCommerce live fixture preparer must be used"
  ],
  [
    /prestashop-live-acceptance-fixture\.php/g,
    "PrestaShop live fixture preparer must be used"
  ],
  [
    /production:woocommerce-live-acceptance/,
    "WooCommerce completion wrapper must be executed"
  ],
  [
    /production:prestashop-live-acceptance/g,
    "PrestaShop completion wrapper must be executed"
  ],
  [
    /production:connector-live-evidence-verify/g,
    "each retained connector evidence file must be verified before promotion"
  ],
  [
    /gateName":"wooCommerceLive"/,
    "WooCommerce verifier output must be bound to wooCommerceLive"
  ],
  [
    /gateName":"prestaShop178Live"/,
    "PrestaShop 1.7.8 verifier output must be bound to prestaShop178Live"
  ],
  [
    /gateName":"prestaShop8Live"/,
    "PrestaShop 8 verifier output must be bound to prestaShop8Live"
  ],
  [
    /retention-days:\s*90/g,
    "completion evidence must be retained for audit"
  ]
];

test("connector live acceptance workflow stays fail-closed", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  for (const [pattern, message] of required) {
    assert.match(workflow, pattern, message);
  }

  assert.doesNotMatch(
    workflow,
    /runs-on:\s*ubuntu-(?:latest|\d)/,
    "live acceptance must not move to a public GitHub-hosted runner"
  );
  assert.doesNotMatch(
    workflow,
    /echo\s+[^\n]*PDECA_ACCEPTANCE_API_KEY/,
    "workflow must not print the live acceptance credential"
  );
  assert.doesNotMatch(
    workflow,
    /customer|production order/i,
    "workflow must remain synthetic and must not normalize customer-data execution"
  );
});
