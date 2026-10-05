import { readFile } from "node:fs/promises";

const source = await readFile(
  "scripts/production/provision-kairoseth-cargo-acceptance.mjs",
  "utf8",
);
const workflow = await readFile(
  ".github/workflows/kairoseth-cargo-acceptance-fixture.yml",
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

const requireWorkflowText = (text, message) => {
  if (!workflow.includes(text)) {
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

for (const required of [
  "workflow_dispatch:",
  "environment: deca-production",
  "ref: main",
  "cancel-in-progress: false",
  "KAIROSETH_CARGO_ACCEPTANCE_API_KEY: ${{ secrets.KAIROSETH_CARGO_ACCEPTANCE_API_KEY }}",
  "PUENTE_DECA_SERVICE_URL: ${{ secrets.PUENTE_DECA_SERVICE_URL }}",
  "PUENTE_DECA_SERVICE_SECRET: ${{ secrets.PUENTE_DECA_SERVICE_SECRET }}",
  "credentialReused !== true",
  "customerData: false",
  "retention-days: 90",
  "retention-days: 1",
  "operator-handoff.json",
  "raw-result.json",
]) {
  requireWorkflowText(
    required,
    `Acceptance fixture workflow contract is missing: ${required}`,
  );
}

if (/on:\s*\n\s*(push|pull_request):/m.test(workflow)) {
  throw new Error(
    "Acceptance fixture workflow must remain manual-only",
  );
}

if (!workflow.includes(
  "npm run --silent production:kairoseth-cargo-acceptance-fixture \\\n            > .artifacts/deca-fixture/raw-result.json",
)) {
  throw new Error(
    "Acceptance fixture workflow must redirect raw provisioner output away from logs",
  );
}

if (!workflow.includes(
  "rm -f \"$RUNNER_TEMP/kairoseth-cargo-acceptance-api-key\"",
)) {
  throw new Error(
    "Acceptance fixture workflow must remove the transient API-key file",
  );
}

console.log(
  "Acceptance fixture contract OK (synthetic, idempotent, manual protected workflow, reusable secret, sanitized retained evidence)",
);
