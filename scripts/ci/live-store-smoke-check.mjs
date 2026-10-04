import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const [woo, presta] = await Promise.all([
  readFile(
    "scripts/production/woocommerce-live-store-smoke.php",
    "utf8"
  ),
  readFile(
    "scripts/production/prestashop-live-store-smoke.php",
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

for (const path of [
  "scripts/production/woocommerce-live-store-smoke.php",
  "scripts/production/prestashop-live-store-smoke.php"
]) {
  const lint = spawnSync(
    "php",
    ["-l", path],
    { encoding: "utf8" }
  );

  if (lint.error?.code === "ENOENT") {
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

console.log(
  "Connector live-store smoke contract OK (explicit roots, PHP syntax, read-only Cargo check, optional local mapping, no shipment/order mutation)"
);
