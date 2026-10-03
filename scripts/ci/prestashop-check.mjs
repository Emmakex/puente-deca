import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const files = {
  main: "connectors/prestashop/puentedeca.php",
  client: "connectors/prestashop/classes/PDECAPrestaShopClient.php",
  payload: "connectors/prestashop/classes/PDECAPrestaShopOrderPayload.php",
  connector: "connectors/prestashop/classes/PDECAPrestaShopConnector.php",
  secrets: "connectors/prestashop/classes/PDECAPrestaShopSecretStore.php"
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([name, path]) => [
      name,
      await readFile(path, "utf8")
    ])
  )
);

const requirePattern = (name, pattern, message) => {
  if (!pattern.test(content[name])) {
    throw new Error(message);
  }
};

requirePattern(
  "main",
  /class\s+PuenteDeca\s+extends\s+Module/,
  "PrestaShop module class is missing"
);
requirePattern(
  "main",
  /'min'\s*=>\s*'1\.7\.8\.0'[\s\S]*'max'\s*=>\s*'8\.99\.99'/,
  "PrestaShop compatibility must stay bounded to the accepted initial range"
);
requirePattern(
  "main",
  /actionOrderStatusPostUpdate/,
  "PrestaShop connector must register the opt-in order status hook"
);
requirePattern(
  "main",
  /displayAdminOrderMainBottom/,
  "PrestaShop connector must expose local order controls"
);
requirePattern(
  "main",
  /CONFIG_AUTO_STATES,\s*''/,
  "PrestaShop automation must default to OFF"
);
requirePattern(
  "client",
  /Authorization:\s*Bearer/,
  "PrestaShop client must authenticate with a connector Bearer key"
);
requirePattern(
  "client",
  /\/v1\/shipments/,
  "PrestaShop client must use the operational shipment API"
);
requirePattern(
  "client",
  /testConnection[sS]*/v1/shipments?limit=1/,
  "PrestaShop connector must expose a non-destructive connection check"
);
requirePattern(
  "main",
  /submitPuenteDecaTestConnection/,
  "PrestaShop settings must expose the connection test action"
);
requirePattern(
  "client",
  /updateShipment/,
  "PrestaShop connector must update an existing shipment"
);
requirePattern(
  "connector",
  /generateDeca/,
  "PrestaShop connector must generate or refresh DeCA"
);
requirePattern(
  "payload",
  /transport_date/,
  "Transport date must come from explicit logistics data"
);
requirePattern(
  "payload",
  /tractor_registration/,
  "Vehicle registration must come from explicit logistics data"
);
requirePattern(
  "payload",
  /product_weight/,
  "PrestaShop payload must use native product weight when available"
);
requirePattern(
  "secrets",
  /sodium_crypto_secretbox|aes-256-gcm/,
  "PrestaShop connector token storage must be encrypted"
);

const allPhp = Object.values(content).join("\n");

for (const forbidden of [
  /KAIROSETH_SERVICE_SECRET/,
  /x-kairoseth-service-secret/i,
  /https?:\/\/deca\.example\.com/
]) {
  if (forbidden.test(allPhp)) {
    throw new Error(
      "PrestaShop may receive only an organization-scoped connector credential"
    );
  }
}

const php = spawnSync("php", ["-v"], { encoding: "utf8" });
if (php.status === 0) {
  for (const path of Object.values(files)) {
    const lint = spawnSync("php", ["-l", path], {
      encoding: "utf8"
    });

    if (lint.status !== 0) {
      throw new Error(
        `PHP lint failed for ${path}: ${lint.stderr || lint.stdout}`
      );
    }
  }
}

console.log(
  "PrestaShop connector contract OK (bounded compatibility, encrypted token, opt-in automation, explicit logistics)"
);
