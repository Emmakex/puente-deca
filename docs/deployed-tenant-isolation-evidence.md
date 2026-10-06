# Deployed tenant-isolation evidence bridge

This bridge converts the protected Kairoseth Platform tenant-isolation artifact into the exact `deployedTenantIsolation` control accepted by Puente DeCA's six-control infrastructure-security manifest.

It is DeCA-only. It does not advance eCMR/eFTI and it never reads customer data.

## Canonical source

The live evidence must come from `Emmakex/kairoseth-platform` and the protected `deca-production` workflow:

```text
.github/workflows/kairoseth-cargo-deployed-tenant-isolation.yml
scripts/check-kairoseth-cargo-deployed-tenant-isolation.sh
```

The retained artifact contains `acceptance-evidence.json` plus its adjacent `acceptance-evidence.json.sha256`.

A completion-grade source proves all of the following through the deployed Kairoseth public DeCA route:

- organization A can read its controlled shipment;
- organization A can read the private DeCA metadata referenced by that shipment;
- organization B has a valid distinct credential;
- organization B's list does not reveal A's controlled shipment;
- B receives sanitized `404 NOT_FOUND` for A's direct shipment object;
- B receives sanitized `404 NOT_FOUND` for A's private DeCA metadata;
- controlled IDs and private fields are not leaked in denial responses;
- the run is read-only and declares no production mutations.

Public PDF delivery is intentionally outside this control because it has its own acceptance gate.

## Verify and promote the control

Use the exact retained files from the Kairoseth Platform workflow:

```bash
node scripts/production/deployed-tenant-isolation-evidence-verify.mjs \
  --evidence=/secure/path/acceptance-evidence.json \
  --checksum=/secure/path/acceptance-evidence.json.sha256
```

`--checksum` is optional when the checksum is adjacent to the evidence file with the `.sha256` suffix.

The verifier fails closed unless:

- the checksum matches the exact retained evidence bytes;
- `schemaVersion` is exactly `2` and the source repository is exactly `Emmakex/kairoseth-platform`;
- commit, workflow run and workflow attempt identifiers are valid;
- both controlled object identities are retained only as SHA-256 hashes;
- owner reads, list isolation and both direct-object denials are all true;
- both leak flags are false;
- the evidence shape has no unexpected fields;
- no API-key/token/password/authorization/MongoDB URI material is serialized.

A valid result contains source provenance plus the exact secret-free control:

```json
{
  "status": "ok",
  "check": "deployed-tenant-isolation-evidence-verify",
  "controlName": "deployedTenantIsolation",
  "source": {
    "repository": "Emmakex/kairoseth-platform",
    "commit": "<40 lowercase hex>",
    "runId": "<GitHub Actions run id>",
    "runAttempt": "<attempt>"
  },
  "control": {
    "status": "pass",
    "evidenceSha256": "sha256:<64 lowercase hex>",
    "referenceId": "kairoseth-platform-run-<run>-attempt-<attempt>",
    "recordedAt": "2026-10-06T19:10:00Z"
  }
}
```

Only the nested `control` object is inserted as `controls.deployedTenantIsolation` in the infrastructure-security manifest. The evidence hash binds that four-field control back to the exact source bytes, which themselves contain the Kairoseth Platform repository, commit, run and attempt provenance.

## Completion boundary

Repository tests and a merged verifier make this path **READY**, not GREEN. `deployedTenantIsolation` becomes eligible for GREEN only after the protected Kairoseth Platform workflow runs against the controlled synthetic A/B identities and its retained artifact successfully passes this verifier.
