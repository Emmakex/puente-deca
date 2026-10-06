import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const [
  woo,
  presta,
  acceptance,
  verifier
] = await Promise.all([
  readFile(
    "scripts/production/woocommerce-live-store-smoke.php",
    "utf8"
  ),
  readFile(
    "scripts/production/prestashop-live-store-smoke.php",
    "utf8"
  ),
  readFile(
    "scripts/production/connector-live-store-acceptance.mjs",
    "utf8"
  ),
  readFile(
    "scripts/production/connector-live-evidence-verify.mjs",
    "utf8"
  )
]);

const requirePattern = (
  source,
  pattern,
  message
) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requirePattern(
  woo,
  /PDECA_WP_ROOT/,
  "WooCommerce live smoke must require an explicit WordPress root"
);
requirePattern(
  woo,
  /test_connection\(\)/,
  "WooCommerce live smoke must execute the non-destructive Cargo read check"
);
requirePattern(
  woo,
  /PDECA_Woo_Order_Payload::build/,
  "WooCommerce live smoke must support local existing-order mapping"
);
requirePattern(
  woo,
  /readOnly'\s*=>\s*true/,
  "WooCommerce live evidence must declare read-only behavior"
);

requirePattern(
  presta,
  /PDECA_PRESTASHOP_ROOT/,
  "PrestaShop live smoke must require an explicit PrestaShop root"
);
requirePattern(
  presta,
  /testConnection\(\)/,
  "PrestaShop live smoke must execute the non-destructive Cargo read check"
);
requirePattern(
  presta,
  /PDECAPrestaShopOrderPayload::build/,
  "PrestaShop live smoke must support local existing-order mapping"
);
requirePattern(
  presta,
  /readOnly'\s*=>\s*true/,
  "PrestaShop live evidence must declare read-only behavior"
);

for (
  const [name, source, forbidden] of [
    [
      "WooCommerce",
      woo,
      [
        /create_shipment\s*\(/,
        /update_shipment\s*\(/,
        /generate_deca\s*\(/,
        /process_order\s*\(/,
        /->save\s*\(/,
        /update_meta_data\s*\(/,
        /delete_meta_data\s*\(/
      ]
    ],
    [
      "PrestaShop",
      presta,
      [
        /createShipment\s*\(/,
        /updateShipment\s*\(/,
        /generateDeca\s*\(/,
        /processOrder\s*\(/,
        /saveSync\s*\(/,
        /saveLogistics\s*\(/,
        /Db::getInstance\(\)->execute/
      ]
    ]
  ]
) {
  for (const pattern of forbidden) {
    if (pattern.test(source)) {
      throw new Error(
        `${name} live-store smoke contains a mutation path: ${pattern}`
      );
    }
  }
}

for (const [pattern, message] of [
  [
    /--connector=woocommerce[\s\S]*--connector=prestashop|woocommerce[\s\S]*prestashop/,
    "Live acceptance wrapper must support WooCommerce and PrestaShop only"
  ],
  [
    /--completion-gate/,
    "Live acceptance wrapper must expose an explicit completion-gate mode"
  ],
  [
    /spawnSync\(\s*"php"/,
    "Live acceptance wrapper must execute the guarded PHP smoke on the store host"
  ],
  [
    /result\?\.readOnly !== true/,
    "Live acceptance wrapper must reject non-read-only results"
  ],
  [
    /result\?\.cargoReadCheck !== true/,
    "Live acceptance wrapper must require the Cargo read check"
  ],
  [
    /mapping[\s\S]*requiredFactsPresent[\s\S]*true/,
    "Live acceptance wrapper must require complete mapped DeCA facts when an order is supplied"
  ],
  [
    /COMPLETION_ORDER_REQUIRED/,
    "Completion evidence must require a smoke order"
  ],
  [
    /PDECA_ACCEPTANCE_DATA_CLASS/,
    "Completion evidence must declare its acceptance data class"
  ],
  [
    /dataClass !== "synthetic"/,
    "Completion evidence must reject non-synthetic order data"
  ],
  [
    /PDECA_ACCEPTANCE_ENVIRONMENT/,
    "Completion evidence must declare the acceptance environment class"
  ],
  [
    /kairoseth-controlled/,
    "Completion evidence must be restricted to a Kairoseth-controlled store"
  ],
  [
    /sourceVersionFile/,
    "Completion evidence must derive the accepted connector version from the exact repository checkout"
  ],
  [
    /acceptedConnectorVersion/,
    "Completion evidence must parse the accepted connector version from source"
  ],
  [
    /CONNECTOR_VERSION_MISMATCH/,
    "Completion evidence must fail when the installed connector version differs from the checkout release"
  ],
  [
    /prestashop-1\.7\.8\.x/,
    "PrestaShop 1.7.8.x completion evidence must be explicitly classified"
  ],
  [
    /prestashop-8\.x/,
    "PrestaShop 8.x completion evidence must be explicitly classified"
  ],
  [
    /completionEligible/,
    "Evidence must disclose whether it is eligible for the DeCA completion gate"
  ],
  [
    /evidenceId/,
    "Live acceptance evidence must include an auditable evidence ID"
  ],
  [
    /rev-parse", "HEAD"/,
    "Live acceptance evidence must bind to an exact repository commit"
  ],
  [
    /createHash\("sha256"\)/,
    "Live acceptance evidence must include a SHA-256 checksum"
  ],
  [
    /evidenceSha256/,
    "Live acceptance command output must surface the retained evidence SHA-256"
  ],
  [
    /mode: 0o600/,
    "Live acceptance evidence must be written owner-only"
  ],
  [
    /\.artifacts\/connector-live\//,
    "Live acceptance evidence must use the dedicated artifact directory"
  ]
]) {
  requirePattern(
    acceptance,
    pattern,
    message
  );
}

for (const forbidden of [
  /JSON\.stringify\(process\.env/,
  /console\.log\(process\.env/,
  /stdout\.write\([\s\S]{0,80}process\.env/,
  /PDECA_WOO_SMOKE_ORDER_ID[\s\S]{0,100}evidence\s*:/,
  /PDECA_PRESTASHOP_SMOKE_ORDER_ID[\s\S]{0,100}evidence\s*:/
]) {
  if (forbidden.test(acceptance)) {
    throw new Error(
      `Live acceptance wrapper must not serialize host/order secrets: ${forbidden}`
    );
  }
}

for (const [pattern, message] of [
  [
    /LIVE_EVIDENCE_CHECKSUM_MISMATCH/,
    "Live evidence verifier must validate the retained SHA-256 sidecar"
  ],
  [
    /schemaVersion !== 2/,
    "Live evidence verifier must require completion evidence schema v2"
  ],
  [
    /completionEligible !== true/,
    "Live evidence verifier must reject diagnostic/non-eligible evidence"
  ],
  [
    /dataClass !==[\s\S]*"synthetic"/,
    "Live evidence verifier must require synthetic acceptance data"
  ],
  [
    /environmentClass !==[\s\S]*"kairoseth-controlled"/,
    "Live evidence verifier must require Kairoseth-controlled evidence"
  ],
  [
    /expectedConnectorVersion/,
    "Live evidence verifier must validate connector release binding"
  ],
  [
    /woocommerce-live-store-smoke/,
    "Live evidence verifier must bind WooCommerce gate classification to WooCommerce runtime evidence"
  ],
  [
    /prestashop-live-store-smoke/,
    "Live evidence verifier must bind PrestaShop gate classification to PrestaShop runtime evidence"
  ],
  [
    /wooCommerceLive/,
    "Live evidence verifier must map WooCommerce evidence to the final gate"
  ],
  [
    /prestaShop178Live/,
    "Live evidence verifier must map PrestaShop 1.7.8.x evidence to the final gate"
  ],
  [
    /prestaShop8Live/,
    "Live evidence verifier must map PrestaShop 8.x evidence to the final gate"
  ],
  [
    /runId:[\s\S]*evidence\.evidenceId/,
    "Live evidence verifier must use evidenceId as the auditable final runId"
  ],
  [
    /evidenceSha256:[\s\S]*sha256:/,
    "Live evidence verifier must emit a final-manifest SHA-256"
  ]
]) {
  requirePattern(
    verifier,
    pattern,
    message
  );
}

for (const path of [
  "scripts/production/woocommerce-live-store-smoke.php",
  "scripts/production/prestashop-live-store-smoke.php"
]) {
  const lint = spawnSync(
    "php",
    ["-l", path],
    { encoding: "utf8" }
  );

  if (
    lint.error?.code ===
    "ENOENT"
  ) {
    throw new Error(
      "PHP is required to syntax-check connector live-store smokes"
    );
  }

  if (lint.status !== 0) {
    throw new Error(
      `PHP lint failed for ${path}: ${lint.stderr || lint.stdout}`
    );
  }
}

for (const path of [
  "scripts/production/connector-live-store-acceptance.mjs",
  "scripts/production/connector-live-evidence-verify.mjs"
]) {
  const nodeSyntax = spawnSync(
    process.execPath,
    ["--check", path],
    { encoding: "utf8" }
  );

  if (nodeSyntax.status !== 0) {
    throw new Error(
      `Node syntax check failed for ${path}: ${nodeSyntax.stderr || nodeSyntax.stdout}`
    );
  }
}

console.log(
  "Connector live-store smoke contract OK (read-only Cargo check, synthetic Kairoseth-controlled completion mapping, checkout-derived connector version binding, PrestaShop line classification, immutable sanitized evidence, final-manifest gate verifier, no shipment/order mutation)"
);
