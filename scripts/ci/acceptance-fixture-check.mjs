import { readFile } from "node:fs/promises";

const source = await readFile(
  "scripts/production/provision-kairoseth-cargo-acceptance.mjs",
  "utf8",
);
const packageJson = JSON.parse(
  await readFile("package.json", "utf8"),
);

const requireText = (text, message) => {
  if (!source.includes(text)) {
    throw new Error(message);
  }
};

if (
  packageJson.scripts?.[
    "production:kairoseth-cargo-acceptance-fixture"
  ] !==
  "node scripts/production/provision-kairoseth-cargo-acceptance.mjs"
) {
  throw new Error(
    "Acceptance fixture provisioner must remain exposed through the documented npm command",
  );
}

for (const variable of [
  "PUENTE_DECA_SERVICE_URL",
  "PUENTE_DECA_SERVICE_SECRET",
  "KAIROSETH_CARGO_ACCEPTANCE_API_KEY_FILE",
]) {
  requireText(
    variable,
    `Acceptance fixture provisioner must require ${variable}`,
  );
}

requireText(
  '"kairoseth-cargo-production-acceptance"',
  "Acceptance fixture must use its isolated synthetic organization by default",
);
requireText(
  '"KAIROSETH-CARGO-PRODUCTION-ACCEPTANCE-V1"',
  "Acceptance fixture must keep a stable synthetic external reference",
);
requireText(
  '"kairoseth-cargo-production-acceptance-v1"',
  "Acceptance fixture must keep its idempotency key",
);
requireText(
  "Synthetic QA fixture - no customer data",
  "Acceptance fixture must remain explicitly synthetic and customer-data free",
);
requireText(
  "mode: 0o600",
  "Acceptance API key must be written with owner-only permissions",
);
requireText(
  "await chmod(apiKeyFile, 0o600)",
  "Acceptance API key permissions must be enforced after writing",
);
requireText(
  "credentialReused",
  "Acceptance fixture must report credential reuse without printing the credential",
);
requireText(
  "shipmentId: shipment.shipmentId",
  "Acceptance fixture must report the synthetic shipment ID",
);
requireText(
  "publicPdfUrl",
  "Acceptance fixture must report the canonical public PDF URL",
);
requireText(
  "pdfSha256",
  "Acceptance fixture must report immutable PDF integrity metadata",
);

const stdoutSection = source.slice(
  source.lastIndexOf("process.stdout.write"),
);

if (/\bapiKey\s*[,}]/.test(stdoutSection)) {
  throw new Error(
    "Acceptance fixture must never print the dedicated API key",
  );
}

if (/\bserviceSecret\s*[,}]/.test(stdoutSection)) {
  throw new Error(
    "Acceptance fixture must never print the service secret",
  );
}

console.log(
  "Acceptance fixture provisioner contract OK (synthetic, idempotent, owner-only secret file, sanitized output)",
);
