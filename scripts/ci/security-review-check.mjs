import { readFile } from "node:fs/promises";

const [
  server,
  mongo,
  gridfs,
  wooSecrets,
  prestaSecrets,
  preflight,
  packageJson,
  envExample
] = await Promise.all([
  readFile("apps/api/src/server.mjs", "utf8"),
  readFile("packages/persistence/src/mongo-store.mjs", "utf8"),
  readFile("packages/persistence/src/gridfs-artifact-store.mjs", "utf8"),
  readFile("connectors/woocommerce/includes/class-pdeca-woo-secret-store.php", "utf8"),
  readFile("connectors/prestashop/classes/PDECAPrestaShopSecretStore.php", "utf8"),
  readFile("apps/api/src/production-preflight.mjs", "utf8"),
  readFile("package.json", "utf8"),
  readFile(".env.example", "utf8")
]);

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requirePattern(
  server,
  /timingSafeEqual/,
  "Kairoseth service secret comparison must remain timing-safe"
);
requirePattern(
  server,
  /createHash\("sha256"\)[\s\S]*timingSafeEqual/,
  "Service secret must be compared through fixed-length hashes"
);
requirePattern(
  server,
  /"x-content-type-options": "nosniff"/,
  "HTTP responses must set X-Content-Type-Options"
);
requirePattern(
  server,
  /"cache-control": "no-store"/,
  "Sensitive HTTP responses must default to no-store"
);
requirePattern(
  server,
  /"referrer-policy": "no-referrer"/,
  "HTTP responses must suppress referrer leakage"
);
requirePattern(
  server,
  /readJson = async \(request, limit = 1024 \* 1024\)/,
  "JSON request bodies must remain bounded"
);
requirePattern(
  server,
  /standaloneToolsEnabled\s*=\s*process\.env\.NODE_ENV\s*!==\s*"production"/,
  "Standalone lab surface must remain disabled in production"
);
requirePattern(
  mongo,
  /keyHash:\s*hashApiKey\(apiKey\)/,
  "Connector API keys must be persisted as hashes"
);
requirePattern(
  mongo,
  /keyHash:\s*hashApiKey\(apiKey\.trim\(\)\)/,
  "Connector authentication must compare hashed API keys"
);
requirePattern(
  gridfs,
  /sha256/,
  "GridFS artifacts must preserve SHA-256 integrity metadata"
);
requirePattern(
  gridfs,
  /MAX_PDF_BYTES\s*=\s*5_000_000/,
  "GridFS PDF size ceiling must remain enforced"
);
requirePattern(
  wooSecrets,
  /sodium_crypto_secretbox|aes-256-gcm/,
  "WooCommerce connector secret storage must remain encrypted"
);
requirePattern(
  prestaSecrets,
  /sodium_crypto_secretbox|aes-256-gcm/,
  "PrestaShop connector secret storage must remain encrypted"
);
requirePattern(
  preflight,
  /PUBLIC_BASE_URL must be exactly https:\/\/kairoseth\.com\/deca/,
  "Production public document URL must remain pinned to Kairoseth"
);
requirePattern(
  preflight,
  /ALLOW_JSON_STORE_IN_PRODUCTION must not be enabled/,
  "Production local metadata override must remain prohibited"
);
requirePattern(
  preflight,
  /ALLOW_FILE_ARTIFACTS_IN_PRODUCTION must not be enabled/,
  "Production local artifact override must remain prohibited"
);

const pkg = JSON.parse(packageJson);
if (
  pkg.dependencies?.mongodb !== "7.5.0" ||
  pkg.dependencies?.qrcode !== "1.5.4" ||
  pkg.dependencies?.["pdf-lib"] !== "1.17.1" ||
  pkg.dependencies?.["@pdf-lib/fontkit"] !== "1.1.1" ||
  pkg.dependencies?.["@fontsource/noto-sans"] !== "5.3.0" ||
  pkg.dependencies?.["read-excel-file"] !== "9.3.10"
) {
  throw new Error(
    "Runtime dependencies must remain exact/pinned until explicitly reviewed"
  );
}

for (const secretName of [
  "KAIROSETH_SERVICE_SECRET",
  "MONGODB_URI"
]) {
  const line = envExample
    .split("\n")
    .find((entry) =>
      entry.startsWith(`${secretName}=`)
    );

  if (!line || line !== `${secretName}=`) {
    throw new Error(
      `${secretName} must remain empty in .env.example`
    );
  }
}

if (
  /console\.(?:log|info|debug)\([^\n]*(?:KAIROSETH_SERVICE_SECRET|MONGODB_URI|authorization|apiKey)/i.test(
    server + mongo + gridfs
  )
) {
  throw new Error(
    "Potential secret logging detected"
  );
}

console.log(
  "Static security contract OK (secrets, auth, headers, hashing, encrypted connector storage, integrity, fail-closed production)"
);
