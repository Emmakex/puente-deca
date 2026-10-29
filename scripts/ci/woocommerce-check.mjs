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
  /Plugin Name:\s*DeCA Transporte for WooCommerce/,
  "WooCommerce plugin must expose the DeCA Transporte commercial name"
);
requirePattern(
  "main",
  /Version:\s*0\.1\.2[\s\S]*PDECA_WOO_VERSION',\s*'0\.1\.2'/,
  "WooCommerce plugin and runtime version must be 0.1.2"
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
  /test_connection[\s\S]*\/v1\/shipments\?limit=1/,
  "WooCommerce connector must expose a non-destructive connection check"
);
requirePattern(
  "settings",
  /pdeca_woo_test_connection/,
  "WooCommerce settings must expose the connection test action"
);
requirePattern(
  "settings",
  /missing_basic_configuration[\s\S]*clave API de Cargo Connect/,
  "WooCommerce setup must report missing basic configuration"
);
requirePattern(
  "settings",
  /Primer DeCA en 3 pasos/,
  "WooCommerce setup must explain the first DeCA flow"
);
requirePattern(
  "settings",
  /Configuración básica[\s\S]*Opciones avanzadas/,
  "WooCommerce setup must separate basic and advanced configuration"
);
requirePattern(
  "settings",
  /https:\/\/kairoseth\.com\/products\/kairoseth-cargo/,
  "WooCommerce setup must link to the canonical DeCA Transporte commercial page"
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
  /woocommerce_admin_order_data_after_order_details/,
  "WooCommerce orders must expose the DeCA Transporte order panel"
);
requirePattern(
  "connector",
  /woocommerce_process_shop_order_meta[\s\S]*save_order_transport/,
  "WooCommerce must save transport data through the order save lifecycle"
);
requirePattern(
  "connector",
  /order_transport_fields[\s\S]*pdeca_transport_date[\s\S]*pdeca_tractor_registration[\s\S]*pdeca_weight_kg/,
  "WooCommerce order panel must expose essential transport fields"
);
requirePattern(
  "connector",
  /save_order_transport[\s\S]*wp_verify_nonce[\s\S]*update_meta_data[\s\S]*save_meta_data/,
  "WooCommerce transport fields must save with nonce protection and WooCommerce CRUD"
);
requirePattern(
  "connector",
  /render_order_panel[\s\S]*Abrir documento DeCA/,
  "WooCommerce order panel must expose the generated DeCA document"
);
requirePattern(
  "connector",
  /META_LAST_ERROR[\s\S]*Último error:/,
  "WooCommerce order panel must surface the latest DeCA error"
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
  "WooCommerce connector contract OK (0.1.2, first-use setup, editable transport data, document access, HPOS/CRUD, encrypted credentials)"
);
