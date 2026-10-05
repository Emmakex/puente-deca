# DeCA infrastructure security acceptance

This gate supplies the `infrastructureSecurity` evidence consumed by the final `deca-100` manifest.

It does not perform intrusive production testing. It validates that every required Kairoseth-controlled infrastructure control has separately produced retained, checksummed evidence.

## Required controls

The manifest must contain exactly these seven controls, all with `status: "pass"`:

1. `atlasLeastPrivilege` — the Puente DeCA runtime identity has only the MongoDB/Atlas privileges required by the agreed production path;
2. `atlasNetworkBoundary` — the intended Atlas network/IP/private-connectivity boundary is active and restricted to the approved Kairoseth runtime path;
3. `deploymentSecretIsolation` — production service/API/operations secrets are server-side, environment-scoped and not exposed to public/client runtime or unrelated CI actions;
4. `deploymentRuntimeIsolation` — the deployed Puente DeCA runtime follows the hardened non-root/container/service boundary and readiness contract;
5. `deployedTenantIsolation` — controlled organization A/B acceptance through the deployed Kairoseth route proves cross-tenant direct-object isolation;
6. `hostingerCdnWafConfiguration` — Kairoseth-controlled evidence confirms the intended Hostinger CDN/WAF/abuse-protection configuration for the production domain;
7. `rollbackReadiness` — the selected deployment path has an exercised or auditable rollback/readiness procedure bound to the accepted release.

The Hostinger control is configuration evidence. It must not be replaced with aggressive production stress/DDoS traffic.

## Evidence schema

Each control contains only:

```json
{
  "status": "pass",
  "evidenceSha256": "sha256:<64 lowercase hex>",
  "repository": "Emmakex/kairoseth-platform",
  "commit": "<git sha>",
  "runId": "<auditable run/evidence id>",
  "recordedAt": "2026-10-05T12:00:00Z"
}
```

The validator rejects extra fields. Do not put Atlas connection strings, IP allowlists, private endpoints, API keys, Hostinger credentials, opaque PDF tokens, passwords or secret values in the manifest.

Sensitive source material may remain in the approved provider/platform console. The retained DeCA evidence should be a sanitized exported/checksummed record that proves the review occurred without reproducing the secret configuration itself.

## Top-level manifest

```json
{
  "schemaVersion": 1,
  "check": "deca-infrastructure-security",
  "environment": "kairoseth-production",
  "generatedAt": "2026-10-05T12:05:00Z",
  "controls": {
    "atlasLeastPrivilege": { "...": "..." },
    "atlasNetworkBoundary": { "...": "..." },
    "deploymentSecretIsolation": { "...": "..." },
    "deploymentRuntimeIsolation": { "...": "..." },
    "deployedTenantIsolation": { "...": "..." },
    "hostingerCdnWafConfiguration": { "...": "..." },
    "rollbackReadiness": { "...": "..." }
  }
}
```

## Validation

Run the fail-closed validator directly:

```bash
node scripts/production/infrastructure-security-acceptance.mjs \
  /secure/path/infrastructure-security-manifest.json \
  /secure/path/infrastructure-security-evidence.json
```

The optional validated output is mode `0600` and contains only the exact secret-free schema. The validator is covered by the normal `node --test` suite, so no separate CI lane or package-script dependency is required.

A successful validation produces the evidence file whose SHA-256 may populate the final manifest's `infrastructureSecurity` gate. It does not automatically make Atlas core, DR, Hostinger edge, or connector-store gates pass; those remain separate evidence rows.

## Internal-only rule

All evidence is collected and reviewed by Kairoseth-controlled personnel, tooling and environments. No customer system or customer data is required. An independent external audit may be commissioned later for assurance or commercial reasons but is not required for the agreed DeCA 100% milestone.
