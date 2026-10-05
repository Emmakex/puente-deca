import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  validateInfrastructureSecurityAcceptance,
} from "../production/infrastructure-security-acceptance.mjs";

const sha = (char) => `sha256:${char.repeat(64)}`;
const evidence = (char, runId) => ({
  status: "pass",
  evidenceSha256: sha(char),
  repository: "Emmakex/kairoseth-platform",
  commit: "81d1f0e0c29e61159007b8e54340ef1bb8a710b0",
  runId,
  recordedAt: "2026-10-05T12:00:00Z",
});

const validManifest = () => ({
  schemaVersion: 1,
  check: "deca-infrastructure-security",
  environment: "kairoseth-production",
  generatedAt: "2026-10-05T12:05:00Z",
  controls: {
    atlasLeastPrivilege: evidence("a", "atlas-least-privilege"),
    atlasNetworkBoundary: evidence("b", "atlas-network-boundary"),
    deploymentSecretIsolation: evidence("c", "deployment-secret-isolation"),
    deploymentRuntimeIsolation: evidence("d", "deployment-runtime-isolation"),
    deployedTenantIsolation: evidence("e", "deployed-tenant-isolation"),
    hostingerCdnWafConfiguration: evidence("f", "hostinger-waf-config"),
    rollbackReadiness: evidence("1", "rollback-readiness"),
  },
});

const validated = validateInfrastructureSecurityAcceptance(validManifest());
assert.equal(validated.allRequiredControlsPassed, true);
assert.deepEqual(Object.keys(validated.controls).sort(), [
  "atlasLeastPrivilege",
  "atlasNetworkBoundary",
  "deployedTenantIsolation",
  "deploymentRuntimeIsolation",
  "deploymentSecretIsolation",
  "hostingerCdnWafConfiguration",
  "rollbackReadiness",
]);

for (const [label, mutate] of [
  ["missing control", (m) => delete m.controls.rollbackReadiness],
  ["pending control", (m) => { m.controls.atlasLeastPrivilege.status = "pending"; }],
  ["bad hash", (m) => { m.controls.atlasNetworkBoundary.evidenceSha256 = "sha256:bad"; }],
  ["wrong environment", (m) => { m.environment = "staging"; }],
  ["secret-bearing extra field", (m) => { m.controls.hostingerCdnWafConfiguration.providerToken = "must-not-be-accepted"; }],
]) {
  const manifest = validManifest();
  mutate(manifest);
  assert.throws(
    () => validateInfrastructureSecurityAcceptance(manifest),
    /INFRASTRUCTURE_SECURITY_ACCEPTANCE_INVALID/,
    label,
  );
}

const dir = await mkdtemp(join(tmpdir(), "deca-infra-security-"));
const input = join(dir, "manifest.json");
const output = join(dir, "evidence.json");
await import("node:fs/promises").then(({ writeFile }) =>
  writeFile(input, `${JSON.stringify(validManifest(), null, 2)}\n`, { mode: 0o600 })
);

const cli = spawnSync(
  process.execPath,
  ["scripts/production/infrastructure-security-acceptance.mjs", input, output],
  { encoding: "utf8" },
);
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
const written = JSON.parse(await readFile(output, "utf8"));
assert.equal(written.allRequiredControlsPassed, true);
assert.equal((await stat(output)).mode & 0o777, 0o600);
assert.doesNotMatch(await readFile(output, "utf8"), /token|password|mongodb(\+srv)?:\/\//i);

console.log(
  "Infrastructure security acceptance contract OK (7 required controls, exact secret-free schema, fail-closed validation, owner-only output)",
);
