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

## Secret-free manifest

Each control accepts exactly:

```json
{
  "status": "pass",
  "evidenceSha256": "sha256:<64 lowercase hex>",
  "referenceId": "internal-evidence-id",
  "recordedAt": "2026-10-05T12:30:00Z"
}
```

Additional fields are rejected. This prevents MongoDB URIs, API keys, opaque public tokens, network rules or other sensitive values from being embedded accidentally.

## Validation

```bash
node scripts/production/infrastructure-security-acceptance.mjs \
  /secure/path/deca-infrastructure-security.json \
  /secure/path/deca-infrastructure-security-evidence.json
```

The optional validated output is written with mode `0600`, and the normal test suite verifies that the validated output does not contain obvious secret material.

A single missing/pending control makes the whole gate fail closed. The SHA-256 of the validated output is the evidence supplied to the `infrastructureSecurity` entry in `final-infrastructure-acceptance.mjs`.

This gate is DeCA-only. It does not advance or accept eCMR/eFTI.
