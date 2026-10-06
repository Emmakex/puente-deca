# Hostinger WAF / managed-edge configuration evidence

This is the manual provider-configuration bridge for the `hostingerWafConfiguration` control in the DeCA infrastructure-security gate.

It deliberately keeps two evidence sources separate and then binds them by SHA-256:

1. **provider configuration evidence** retained from a reviewed Hostinger hPanel view/export, sanitized before retention;
2. **technical edge evidence** from Kairoseth Platform's protected `Kairoseth Cargo Hostinger Edge Acceptance` workflow.

The technical smoke is necessary but cannot self-certify provider WAF/DDoS configuration. Conversely, an hPanel capture is not enough by itself to prove that the deployed DeCA public route is actually traversing the intended CDN edge with TLS/CSP/integrity behavior.

## Hostinger controls to inspect

For `kairoseth.com/deca`, record a provider inspection only when all of these are true:

- Hostinger CDN is active;
- managed edge security/filtering is enabled;
- the selected security level is `low`, `medium`, `high`, or `under-attack` — an off/effectively-off setting is not accepted;
- DDoS protection is enabled/active for the intended Hostinger edge path;
- traffic-blocking settings have been reviewed so intended application traffic is not accidentally excluded from protection;
- API compatibility has been reviewed so the chosen security level does not break the DeCA API path.

`under-attack` is accepted when it is genuinely active, but it is **not** required as a permanent setting. Hostinger documents it as a temporary DDoS-response mode and warns that it can interfere with API traffic.

Current Hostinger references used to define this inspection:

- `https://www.hostinger.com/support/10695636-hostinger-cdn-security-levels/`
- `https://www.hostinger.com/support/8512979-hostinger-cdn-the-under-attack-mode/`
- `https://www.hostinger.com/support/7935917-hostinger-cdn-website-optimization/`
- `https://www.hostinger.com/support/which-server-capabilities-are-supported-at-hostinger/`

## Inspection manifest

Keep the hPanel evidence itself outside Git. Before hashing it, sanitize it so it contains no account identifiers, credentials, secrets, private customer data or unrelated configuration.

Create a small JSON manifest alongside it:

```json
{
  "schemaVersion": 1,
  "check": "hostinger-waf-configuration-inspection",
  "recordedAt": "2026-10-06T19:45:00Z",
  "provider": "Hostinger",
  "scope": "kairoseth.com/deca",
  "providerEvidenceSha256": "sha256:<sha256 of sanitized hPanel evidence>",
  "edgeEvidenceSha256": "sha256:<sha256 of protected edge acceptance-evidence.json>",
  "referenceId": "hostinger-waf-inspection-YYYYMMDD",
  "controls": {
    "cdnActive": true,
    "managedEdgeSecurityEnabled": true,
    "securityLevel": "medium",
    "ddosProtectionEnabled": true,
    "trafficBlockingReviewed": true,
    "apiCompatibilityReviewed": true
  },
  "providerEvidenceContainsSecrets": false,
  "customerDataRetained": false
}
```

## Verify and promote

Use the exact protected Kairoseth edge artifact plus the sanitized provider evidence:

```bash
node scripts/production/hostinger-waf-configuration-evidence-verify.mjs \
  --inspection=/secure/path/hostinger-waf-inspection.json \
  --provider-evidence=/secure/path/sanitized-hostinger-evidence.pdf \
  --edge-evidence=/secure/path/acceptance-evidence.json \
  --edge-checksum=/secure/path/acceptance-evidence.json.sha256
```

The verifier checks both retained hashes, the exact inspection schema, the provider/security controls, and the protected edge evidence. It requires the edge proof to show Hostinger CDN observation, valid TLS, fail-closed CSP, stable PDF integrity, safe replay behavior, failed tampered-token/traversal attempts, no forbidden-header leak, and explicitly **no volumetric load test**.

A valid result emits an exact four-field `hostingerWafConfiguration` control accepted by `infrastructure-security-acceptance.mjs`. The control's evidence hash is the inspection-manifest hash; that manifest in turn binds the provider evidence and protected edge evidence hashes.

## Completion boundary

Repository CI only makes this path **READY**. The control becomes eligible for GREEN after:

1. the protected Kairoseth edge workflow has produced a valid retained artifact;
2. the intended Hostinger hPanel configuration has been reviewed and sanitized evidence retained;
3. the inspection manifest has been created from those exact two artifacts;
4. this verifier passes on the exact retained bytes.

Do not run a synthetic volumetric/DDoS load test against production for this acceptance.
