import { readFile } from "node:fs/promises";

const source = await readFile(
  ".github/workflows/atlas-core-acceptance.yml",
  "utf8"
);

for (const required of [
  "name: DeCA Atlas Core Acceptance",
  "workflow_dispatch:",
  "environment: deca-production",
  "ref: main",
  "MONGODB_URI: ${{ secrets.MONGODB_URI }}",
  "KAIROSETH_SERVICE_SECRET: ${{ secrets.KAIROSETH_SERVICE_SECRET }}",
  "production:atlas-core-acceptance",
  "acceptance-evidence.json",
  "acceptance-evidence.json.sha256",
  "retention-days: 90"
]) {
  if (!source.includes(required)) {
    throw new Error(
      `Atlas core workflow is missing ${required}`
    );
  }
}

for (const forbidden of [
  "public_pdf_url",
  "public_pdf_sha256",
  "DECA_SMOKE_PUBLIC_URL",
  "DECA_SMOKE_EXPECTED_SHA256",
  "production:public-pdf-smoke",
  "production:kairoseth-health-smoke"
]) {
  if (source.includes(forbidden)) {
    throw new Error(
      `Focused Atlas core workflow must not recouple an already-closed edge gate: ${forbidden}`
    );
  }
}

if (
  /echo\s+[^\n]*(?:MONGODB_URI|KAIROSETH_SERVICE_SECRET)/.test(
    source
  )
) {
  throw new Error(
    "Atlas core workflow must not echo production secrets"
  );
}

console.log(
  "Atlas core workflow contract OK (protected main, production environment, retained sanitized evidence, no edge recoupling)"
);
