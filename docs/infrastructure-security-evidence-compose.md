# DeCA infrastructure-security evidence composer

This command removes the last manual copy/paste step between the six individual infrastructure-security evidence gates and the canonical `deca-infrastructure-security-acceptance` bundle.

It is DeCA-only. It does not advance eCMR/eFTI.

## Inputs

The composer consumes the exact retained evidence previously accepted by the individual fail-closed verifiers:

- Atlas/runtime inspection manifest;
- sanitized Atlas database-role evidence;
- sanitized Atlas network-access evidence;
- sanitized Hostinger/GitHub runtime-secret-scope evidence;
- deployed tenant-isolation evidence and checksum;
- deployment-readiness/rollback evidence and checksum;
- Hostinger WAF inspection manifest;
- sanitized Hostinger provider configuration evidence;
- protected Kairoseth Hostinger edge evidence and checksum.

No control object is supplied manually.

## Compose the six-control bundle

From the exact Puente DeCA release checkout:

```bash
npm run production:infrastructure-security-evidence-compose -- \
  --atlas-inspection=/secure/deca/atlas-runtime-security-inspection.json \
  --atlas-role-evidence=/secure/deca/atlas-role-evidence.pdf \
  --atlas-network-evidence=/secure/deca/atlas-network-evidence.pdf \
  --runtime-secret-evidence=/secure/deca/runtime-secret-scope-evidence.pdf \
  --tenant-evidence=/secure/deca/tenant/acceptance-evidence.json \
  --tenant-checksum=/secure/deca/tenant/acceptance-evidence.json.sha256 \
  --rollback-evidence=/secure/deca/rollback/acceptance-evidence.json \
  --rollback-checksum=/secure/deca/rollback/acceptance-evidence.json.sha256 \
  --waf-inspection=/secure/deca/hostinger-waf-inspection.json \
  --waf-provider-evidence=/secure/deca/sanitized-hostinger-evidence.pdf \
  --edge-evidence=/secure/deca/edge/acceptance-evidence.json \
  --edge-checksum=/secure/deca/edge/acceptance-evidence.json.sha256 \
  --output=/secure/deca/deca-infrastructure-security-evidence.json
```

Checksum arguments are optional only where the underlying verifier already supports the adjacent `<evidence>.sha256` convention.

When `--output` is supplied, the validated bundle is written with mode `0600`.

## What the composer does

The composer does not trust pre-built control JSON. It re-runs the four source verifiers directly:

1. Atlas/runtime verifier → `atlasLeastPrivilege`, `atlasNetworkAccess`, `runtimeSecretScope`;
2. deployed tenant-isolation verifier → `deployedTenantIsolation`;
3. deployment-readiness/rollback verifier → `deploymentReadinessRollback`;
4. Hostinger WAF/provider verifier → `hostingerWafConfiguration`.

It then requires the canonical verifier check names, exact control names, exact four-field control shapes and `status=pass`. Missing, duplicated, renamed or extra controls fail closed.

The bundle `recordedAt` is derived from the latest retained control timestamp. The resulting manifest is passed immediately through `validateInfrastructureSecurityAcceptance`; therefore the composer cannot emit a bundle that the canonical infrastructure-security gate would reject.

Expected retained shape:

```json
{
  "schemaVersion": 1,
  "check": "deca-infrastructure-security-acceptance",
  "recordedAt": "2026-10-06T20:10:00.000Z",
  "status": "pass",
  "controls": {
    "atlasLeastPrivilege": { "status": "pass", "evidenceSha256": "sha256:...", "referenceId": "...", "recordedAt": "..." },
    "atlasNetworkAccess": { "status": "pass", "evidenceSha256": "sha256:...", "referenceId": "...", "recordedAt": "..." },
    "runtimeSecretScope": { "status": "pass", "evidenceSha256": "sha256:...", "referenceId": "...", "recordedAt": "..." },
    "deployedTenantIsolation": { "status": "pass", "evidenceSha256": "sha256:...", "referenceId": "...", "recordedAt": "..." },
    "deploymentReadinessRollback": { "status": "pass", "evidenceSha256": "sha256:...", "referenceId": "...", "recordedAt": "..." },
    "hostingerWafConfiguration": { "status": "pass", "evidenceSha256": "sha256:...", "referenceId": "...", "recordedAt": "..." }
  }
}
```

## Promote into the final `deca-100` gate

After retaining the exact composed output, promote it without editing it:

```bash
npm run production:infrastructure-security-evidence-promote -- \
  /secure/deca/deca-infrastructure-security-evidence.json
```

The promoter revalidates the retained six-control bundle, hashes the exact retained bytes and binds the resulting `infrastructureSecurity` rollup gate to the exact `Emmakex/puente-deca` Git checkout.

Do not transcribe or recalculate the final rollup gate by hand.

## Completion boundary

The composer is automation only. It cannot turn READY evidence paths into GREEN controls. If any provider/live evidence has not actually been collected or any protected acceptance workflow has not actually run, composition must fail before the final gate is produced.
