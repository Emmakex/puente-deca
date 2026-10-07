import { readFile } from "node:fs/promises";

const [workflowSource, atlasCoreSource] = await Promise.all([
  readFile(
    ".github/workflows/atlas-core-acceptance.yml",
    "utf8"
  ),
  readFile(
    "scripts/production/atlas-core-acceptance.mjs",
    "utf8"
  )
]);

for (const required of [
  "name: DeCA Atlas Core Acceptance",
  "workflow_dispatch:",
  "group: puente-deca-atlas-core-acceptance",
  "cancel-in-progress: true",
  "environment: deca-production",
  "runs-on: ubuntu-24.04",
  "ref: main",
  "OPERATIONS_HEALTH_SECRET: ${{ secrets.OPERATIONS_HEALTH_SECRET }}",
  "OPERATIONS_HEALTH_SECRET is not configured in the deca-production environment",
  "https://kairoseth.com/api/operations/deca/atlas-core-acceptance",
  "x-kairoseth-acceptance-confirm: deca-atlas-core-production",
  "hostinger-in-process",
  "acceptance-evidence.json",
  "acceptance-evidence.json.sha256",
  "retention-days: 90"
]) {
  if (!workflowSource.includes(required)) {
    throw new Error(
      `Atlas core workflow is missing ${required}`
    );
  }
}

for (const forbidden of [
  "cancel-in-progress: false",
  "self-hosted",
  "MONGODB_URI",
  "KAIROSETH_SERVICE_SECRET",
  "production:atlas-core-acceptance",
  "public_pdf_url",
  "public_pdf_sha256",
  "DECA_SMOKE_PUBLIC_URL",
  "DECA_SMOKE_EXPECTED_SHA256",
  "production:public-pdf-smoke",
  "production:kairoseth-health-smoke"
]) {
  if (workflowSource.includes(forbidden)) {
    throw new Error(
      `Focused Atlas core workflow contains forbidden coupling: ${forbidden}`
    );
  }
}

if (!atlasCoreSource.includes('"--topology=in-process"')) {
  throw new Error(
    "Atlas core acceptance must run production preflight with explicit in-process topology"
  );
}

if (
  /echo\s+[^\n]*\$(?:\{)?(?:OPERATIONS_HEALTH_SECRET|MONGODB_URI|KAIROSETH_SERVICE_SECRET)/.test(
    workflowSource
  )
) {
  throw new Error(
    "Atlas core workflow must not echo production secret values"
  );
}

console.log(
  "Atlas core workflow contract OK (latest-run supersession, GitHub stores only operations secret, Atlas executes in Kairoseth Hostinger runtime, retained sanitized evidence, no runner/database secret coupling)"
);
