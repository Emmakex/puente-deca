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
  "environment: deca-production",
  "ref: main",
  "MONGODB_URI: ${{ secrets.MONGODB_URI }}",
  "MONGODB_URI is not configured in the deca-production environment",
  "production:atlas-core-acceptance",
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
  "KAIROSETH_SERVICE_SECRET",
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
  /echo\s+[^\n]*\$(?:\{)?(?:MONGODB_URI|KAIROSETH_SERVICE_SECRET)/.test(
    workflowSource
  )
) {
  throw new Error(
    "Atlas core workflow must not echo production secret values"
  );
}

console.log(
  "Atlas core workflow contract OK (protected main, in-process topology, Atlas secret only, retained sanitized evidence, no edge recoupling)"
);
