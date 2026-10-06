import { readFile } from "node:fs/promises";

const source = await readFile(
  "scripts/production/go-live.mjs",
  "utf8"
);

const requirePattern = (
  pattern,
  message
) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

for (const requiredScript of [
  "production:preflight",
  "production:atlas-smoke",
  "production:atlas-concurrency-smoke",
  "production:kairoseth-health-smoke",
  "production:public-pdf-smoke",
  "artifacts:reconcile"
]) {
  if (
    !source.includes(
      `"${requiredScript}"`
    )
  ) {
    throw new Error(
      `Go-live orchestrator is missing ${requiredScript}`
    );
  }
}

for (const anomaly of [
  "missingBeforeRetention",
  "missingAfterRetention",
  "orphanedArtifacts",
  "purgedArtifactsStillPresent"
]) {
  if (!source.includes(anomaly)) {
    throw new Error(
      `Go-live orchestrator must block on ${anomaly}`
    );
  }
}

requirePattern(
  /manualGatesRemaining/,
  "Go-live result must disclose remaining live acceptance gates"
);

requirePattern(
  /manualGateStatus/,
  "Go-live result must expose structured live-gate status"
);

for (const automationCommand of [
  "production:woocommerce-live-acceptance",
  "production:prestashop-live-acceptance",
  "production:backup-restore-drill",
  "production:infrastructure-security-evidence-compose",
  "production:infrastructure-security-evidence-promote",
  "final-infrastructure-acceptance.mjs"
]) {
  if (!source.includes(automationCommand)) {
    throw new Error(
      `Go-live live-gate status is missing ${automationCommand}`
    );
  }
}

for (const protectedWorkflow of [
  "DeCA Atlas Core Acceptance",
  "DeCA Backup Restore Acceptance",
  "Kairoseth Cargo Deployed Tenant Isolation",
  "Kairoseth DeCA Deployment Readiness Rollback"
]) {
  if (!source.includes(protectedWorkflow)) {
    throw new Error(
      `Go-live must name protected workflow: ${protectedWorkflow}`
    );
  }
}

for (const expectedGate of [
  "atlas-core-live-acceptance",
  "backup-restore-drill",
  "woocommerce-live-store-read-acceptance",
  "prestashop-1.7.8-live-store-read-acceptance",
  "prestashop-8-live-store-read-acceptance",
  "deployed-tenant-isolation",
  "deployment-readiness-rollback",
  "hostinger-waf-provider-configuration",
  "atlas-runtime-security-inspection",
  "infrastructure-security-compose-promote",
  "deca-100-final-freeze"
]) {
  if (!source.includes(`"${expectedGate}"`)) {
    throw new Error(
      `Go-live must disclose remaining ledger gate ${expectedGate}`
    );
  }
}

for (const externallyOwnedGate of [
  "hostinger-waf-provider-configuration",
  "atlas-runtime-security-inspection"
]) {
  if (
    !new RegExp(
      `id:[\\s\\S]{0,120}"${externallyOwnedGate}"[\\s\\S]{0,160}automation:[\\s\\S]{0,40}"external"`
    ).test(source)
  ) {
    throw new Error(
      `Go-live must mark ${externallyOwnedGate} as externally owned evidence`
    );
  }
}

for (const staleGate of [
  "kairoseth-engine-production-acceptance",
  "edge-volumetric-protection",
  "focused-external-penetration-test"
]) {
  if (source.includes(staleGate)) {
    throw new Error(
      `Go-live must not report already-closed or obsolete gate ${staleGate}`
    );
  }
}

requirePattern(
  /no volumetric production test/,
  "Go-live must preserve the non-disruptive Hostinger provider-evidence boundary"
);

requirePattern(
  /productionReady:[\s\S]*manualGatesRemaining[\s\S]*length === 0/,
  "Automated acceptance must not claim production-ready while live gates remain"
);

requirePattern(
  /DECA_SMOKE_PUBLIC_URL/,
  "Go-live must require a controlled public DeCA URL"
);

requirePattern(
  /DECA_SMOKE_EXPECTED_SHA256/,
  "Go-live must require immutable public-PDF integrity metadata"
);

if (
  /SKIP_|BYPASS_|FORCE_GO_LIVE|IGNORE_FAILURE/i.test(
    source
  )
) {
  throw new Error(
    "Go-live orchestration must not expose bypass/skip controls"
  );
}

if (
  /MONGODB_URI|KAIROSETH_SERVICE_SECRET/.test(
    source
  )
) {
  throw new Error(
    "Go-live orchestration must delegate secret validation and never inspect or print production credentials"
  );
}

console.log(
  "Go-live orchestration contract OK (automated core, ledger-aligned live gates, zero reconciliation anomalies, no bypasses)"
);
