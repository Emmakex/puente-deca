# DeCA infrastructure security acceptance

This is the Kairoseth-owned infrastructure-security evidence gate for the DeCA 100% milestone.

It does **not** probe customer systems and does not store provider credentials. The gate is completed only after the following six controls have been inspected on the intended Kairoseth-owned infrastructure and each control has retained evidence with a SHA-256 digest.

## Required controls

### `atlasLeastPrivilege`

Evidence must show that the service identity used by Puente DeCA has only the MongoDB/Atlas permissions required by the deployed application and no administrative/user-management capability beyond that need.

Do not store the username, password, connection URI or secret material in the manifest.

### `atlasNetworkAccess`

Evidence must show that Atlas network access is restricted to the intended Kairoseth runtime path(s), approved addresses/private connectivity, and does not rely on unrestricted public ingress.

The manifest stores only the retained evidence hash/reference, never IP allowlists or connection strings.

### `runtimeSecretScope`

Evidence must show that production service/API/health credentials are held in the intended secret-management surface, are not committed to the repository, and are exposed only to runtime/workflow steps that require them.

### `deployedTenantIsolation`

Evidence must show, with controlled synthetic organizations A/B, that the **deployed Kairoseth production-class route** keeps shipment/private DeCA access scoped to the authenticated organization and rejects a cross-organization direct-object request.

This is separate from the already-green internal E2E/security suites: the evidence must come from the intended deployed Kairoseth boundary. It must use Kairoseth-controlled synthetic fixtures only and must not include customer data in the retained manifest.

### `deploymentReadinessRollback`

Evidence must show the chosen Kairoseth-owned runtime has a working readiness boundary and a documented/tested rollback path for the deployed DeCA service version.

This control is separate from application unit/container tests: it refers to the actual controlled deployment runtime.

### `hostingerWafConfiguration`

Evidence must show that the Hostinger/CDN/WAF layer has the intended public-edge abuse/volumetric protections enabled for the DeCA public route. The safe Hostinger edge acceptance workflow deliberately does not perform a DDoS/volumetric load test.

## Secret-free control manifest

Each control accepts exactly:

```json
{
  "status": "pass",
  "evidenceSha256": "sha256:<64 lowercase hex>",
  "referenceId": "internal-evidence-id",
  "recordedAt": "2026-10-06T18:30:00Z"
}
```

Additional fields are rejected. This prevents MongoDB URIs, API keys, opaque public tokens, network rules or other sensitive values from being embedded accidentally.

The top-level input contains only `schemaVersion`, `check`, `recordedAt` and the exact six controls. One missing/pending control makes the entire gate fail closed.

## Validate the six-control bundle

Use an exact checkout of the release being closed:

```bash
npm run production:infrastructure-security-acceptance -- \
  /secure/path/deca-infrastructure-security.json \
  /secure/path/deca-infrastructure-security-evidence.json
```

The optional validated output is written with mode `0600`. The normal test suite verifies that the validated output cannot carry extra secret-bearing control fields and that all six controls are mandatory.

## Promote validated evidence into `deca-100`

Do not manually calculate and transcribe the final `infrastructureSecurity` gate. After validation, run:

```bash
npm run production:infrastructure-security-evidence-promote -- \
  /secure/path/deca-infrastructure-security-evidence.json
```

The promoter:

- re-runs the infrastructure-security validator against the retained file;
- hashes the exact retained evidence bytes with SHA-256;
- binds promotion to `git rev-parse HEAD` from the exact repository checkout;
- derives a deterministic secret-free `runId` from the evidence digest;
- emits the exact gate object accepted by `scripts/production/final-infrastructure-acceptance.mjs`.

Expected shape:

```json
{
  "status": "ok",
  "check": "infrastructure-security-evidence-promote",
  "gateName": "infrastructureSecurity",
  "gate": {
    "status": "pass",
    "evidenceSha256": "sha256:<64 lowercase hex>",
    "repository": "Emmakex/puente-deca",
    "commit": "<40 hex>",
    "runId": "infra-security-<digest-prefix>",
    "recordedAt": "2026-10-06T18:35:00Z"
  }
}
```

The nested `gate` object has exactly the six keys required by the final `deca-100` infrastructure manifest. No MongoDB URI, WAF rule, API key, token, IP allowlist or provider credential is copied into that final gate.

## Evidence ownership boundary

Internal CI evidence can support internal controls, but it does not by itself satisfy deployed/provider controls. In particular:

- the existing internal security workflow is useful supporting evidence for static/auth/isolation behavior;
- `deployedTenantIsolation` must still be demonstrated at the intended deployed Kairoseth boundary;
- `deploymentReadinessRollback` must refer to the actual controlled runtime/revision;
- `hostingerWafConfiguration` requires retained provider/edge configuration evidence rather than a synthetic volumetric test;
- Atlas least-privilege/network-access evidence remains an infrastructure inspection, not an application-unit-test result.

This prevents already-green internal tests from being reused incorrectly to self-certify the remaining external infrastructure controls.

This gate is DeCA-only. It does not advance or accept eCMR/eFTI.
