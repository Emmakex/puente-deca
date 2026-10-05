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
    "Acceptance fixture operator fallback must remain exposed through the documented npm command",
  );
}

for (const variable of [
  "PUENTE_DECA_SERVICE_URL",
  "PUENTE_DECA_SERVICE_SECRET",
  "KAIROSETH_CARGO_ACCEPTANCE_API_KEY_FILE",
]) {
  requireText(
    variable,
    `Local acceptance fixture fallback must keep ${variable}`,
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
  "Local fallback API key must be written with owner-only permissions",
);
requireText(
  "await chmod(apiKeyFile, 0o600)",
  "Local fallback API key permissions must be enforced after writing",
);

const stdoutSection = source.slice(
  source.lastIndexOf("process.stdout.write"),
);

if (/\bapiKey\s*[,}]/.test(stdoutSection)) {
  throw new Error(
    "Local acceptance fixture fallback must never print the dedicated API key",
  );
}

if (/\bserviceSecret\s*[,}]/.test(stdoutSection)) {
  throw new Error(
    "Local acceptance fixture fallback must never print the service secret",
  );
}

for (const required of [
  "workflow_dispatch:",
  "environment: deca-production",
  "ref: main",
  "cancel-in-progress: false",
  "OPERATIONS_HEALTH_SECRET: ${{ secrets.OPERATIONS_HEALTH_SECRET }}",
  "https://kairoseth.com/api/operations/deca/acceptance-fixture",
  "x-kairoseth-acceptance-confirm: synthetic-production-fixture",
  "Authorization: Bearer $OPERATIONS_HEALTH_SECRET",
  "result?.synthetic !== true",
  "result?.customerData !== false",
  "source: 'deployed-kairoseth-runtime-bridge'",
  "head -c 5",
  '"%PDF-"',
  "5000000",
  "sha256sum",
  "retention-days: 90",
  "retention-days: 1",
  "operator-handoff.json",
  "raw-result.json",
  "public-pdf-url.txt",
  "Kairoseth fixture request failed (curl=",
  "Sanitized response: status=",
  "reason=${safeReason}",
  "let safeReason = 'unavailable'",
  "RAW_RESPONSE_PATH=\"$raw\" node",
  "Intentionally do not print the raw body",
]) {
  requireWorkflowText(
    required,
    `Acceptance fixture workflow contract is missing: ${required}`,
  );
}

for (const forbidden of [
  "KAIROSETH_CARGO_ACCEPTANCE_API_KEY",
  "PUENTE_DECA_SERVICE_URL",
  "PUENTE_DECA_SERVICE_SECRET",
  "kairoseth-cargo-acceptance-api-key",
  'cat "$raw"',
  'head -c 400 "$raw"',
]) {
  if (workflow.includes(forbidden)) {
    throw new Error(
      `Acceptance fixture workflow must not depend on or expose protected material: ${forbidden}`,
    );
  }
}

if (/on:\s*\n\s*(push|pull_request):/m.test(workflow)) {
  throw new Error(
    "Acceptance fixture workflow must remain manual-only",
  );
}

if (!workflow.includes(
  'rm -f .artifacts/deca-fixture/raw-result.json',
)) {
  throw new Error(
    "Acceptance fixture workflow must remove the raw protected response",
  );
}

if (!workflow.includes(
  'rm -f "$RUNNER_TEMP/kairoseth-cargo-acceptance.pdf"',
)) {
  throw new Error(
    "Acceptance fixture workflow must remove the transient PDF copy",
  );
}

console.log(
  "Acceptance fixture contract OK (synthetic, idempotent, Kairoseth-runtime bridged, manual protected workflow, sanitized retained evidence and diagnostics)",
);
