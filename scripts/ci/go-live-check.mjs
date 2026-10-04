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
  "Go-live result must disclose remaining manual acceptance gates"
);

requirePattern(
  /manualGateStatus/,
  "Go-live result must expose structured external-gate status"
);

for (const automationCommand of [
  "production:woocommerce-live-smoke",
  "production:prestashop-live-smoke",
  "production:backup-restore-drill"
]) {
  if (!source.includes(automationCommand)) {
    throw new Error(
      `Go-live external-gate status is missing ${automationCommand}`
    );
  }
}

requirePattern(
  /Kairoseth Cargo Engine Production Acceptance/,
  "Go-live must name the private Kairoseth engine acceptance workflow"
);

for (const externallyOwnedGate of [
  "edge-volumetric-protection",
  "live-infrastructure-security-review",
  "focused-external-penetration-test"
]) {
  if (
    !new RegExp(
      `id:[\\s\\S]{0,120}"${externallyOwnedGate}"[\\s\\S]{0,160}automation:[\\s\\S]{0,40}"external"`
    ).test(source)
  ) {
    throw new Error(
      `Go-live must mark ${externallyOwnedGate} as externally owned`
    );
  }
}

requirePattern(
  /kairoseth-engine-production-acceptance/,
  "Go-live must disclose the external Kairoseth engine production acceptance gate"
);

requirePattern(
  /productionReady:[\s\S]*manualGatesRemaining[\s\S]*length === 0/,
  "Automated acceptance must not claim production-ready while manual gates remain"
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
  "Go-live orchestration contract OK (all automated gates, zero reconciliation anomalies, structured external-gate status, no bypasses)"
);
