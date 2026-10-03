import {
  readFile
} from "node:fs/promises";

const files = {
  main: "connectors/woocommerce/puente-deca-woocommerce.php",
  client:
    "connectors/woocommerce/includes/class-pdeca-woo-client.php",
  payload:
    "connectors/woocommerce/includes/class-pdeca-woo-order-payload.php",
  connector:
    "connectors/woocommerce/includes/class-pdeca-woo-connector.php",
  settings:
    "connectors/woocommerce/includes/class-pdeca-woo-settings.php",
  secrets:
    "connectors/woocommerce/includes/class-pdeca-woo-secret-store.php"
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(
      async ([name, path]) => [
        name,
        await readFile(path, "utf8")
      ]
    )
  )
);

const requirePattern = (
  name,
  pattern,
  message
) => {
  if (!pattern.test(content[name])) {
    throw new Error(message);
  }
};

requirePattern(
  "main",
  /Plugin Name:\s*Kairoseth Cargo - DeCA for WooCommerce/,
  "WooCommerce plugin header is missing"
);
requirePattern(
  "main",
  /declare_compatibility\(\s*'custom_order_tables'/,
  "WooCommerce connector must declare HPOS compatibility"
);
requirePattern(
  "client",
  /Authorization'.*Bearer/s,
  "WooCommerce client must authenticate with a bearer API key"
);
requirePattern(
  "client",
  /\/v1\/shipments/,
  "WooCommerce client must use the operational shipment API"
);
requirePattern(
  "client",
  /update_shipment/,
  "WooCommerce client must support updating an existing shipment"
);
requirePattern(
  "connector",
  /generate_deca/,
  "WooCommerce connector must trigger DeCA generation"
);
requirePattern(
  "connector",
  /as_enqueue_async_action/,
  "WooCommerce connector should use Action Scheduler when available"
);
requirePattern(
  "connector",
  /wp_schedule_single_event/,
  "WooCommerce connector must keep the WordPress cron fallback"
);
requirePattern(
  "payload",
  /wc_get_weight/,
  "WooCommerce payload must normalize product weight through WooCommerce"
);
requirePattern(
  "secrets",
  /sodium_crypto_secretbox|aes-256-gcm/,
  "WooCommerce API key storage must be encrypted"
);

const allPhp = Object.values(content).join("\n");

for (const forbidden of [
  /\$wpdb\b/,
  /\bget_post_meta\s*\(/,
  /\bupdate_post_meta\s*\(/
]) {
  if (forbidden.test(allPhp)) {
    throw new Error(
      "WooCommerce connector must use WooCommerce CRUD rather than direct order persistence access"
    );
  }
}

if (
  /add_order_note\([\s\S]{0,300}access_url/.test(
    content.connector
  )
) {
  throw new Error(
    "Public DeCA access URL must not be copied into WooCommerce order notes"
  );
}

console.log(
  "WooCommerce connector contract OK (HPOS/CRUD, encrypted credentials, async flow)"
);
