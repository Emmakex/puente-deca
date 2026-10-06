# Deployment readiness/rollback evidence bridge

This bridge converts the protected Kairoseth Platform deployment-readiness/rollback artifact into the exact `deploymentReadinessRollback` control accepted by Puente DeCA's six-control infrastructure-security manifest.

It is DeCA-only and does not advance eCMR/eFTI.

## Canonical source

The retained source must come from `Emmakex/kairoseth-platform` and the protected workflow:

```text
.github/workflows/kairoseth-deca-deployment-readiness-rollback.yml
```

That workflow proves the actual Kairoseth production readiness boundary serves the exact accepted `main` revision, then performs a non-destructive rollback rehearsal in runner temporary storage. The rehearsal must restore the exact direct-parent Git tree and that restored tree must pass its production build.

The source artifact contains:

```text
acceptance-evidence.json
acceptance-evidence.json.sha256
```

## Verify and promote the control

Use the exact retained files from the protected Kairoseth Platform run:

```bash
node scripts/production/deployment-readiness-rollback-evidence-verify.mjs \
  --evidence=/secure/path/acceptance-evidence.json \
  --checksum=/secure/path/acceptance-evidence.json.sha256
```

`--checksum` is optional when the checksum file is adjacent to the evidence file with the `.sha256` suffix.

The verifier fails closed unless the retained bytes prove:

- an exact matching SHA-256 checksum;
- schema version `1` and source repository `Emmakex/kairoseth-platform`;
- valid source commit/run provenance and timestamp;
- a read-only production probe with no production mutation;
- `/api/health` serving the exact source commit;
- rollback strategy `git-revert-main-and-redeploy`;
- a distinct 40-character rollback revision and target tree;
- exact rollback-tree restoration;
- successful production build of the restored tree;
- rehearsal-only execution;
- no unexpected or secret-bearing retained fields.

A valid result contains source provenance plus the exact four-field control:

```json
{
  "status": "ok",
  "check": "deployment-readiness-rollback-evidence-verify",
  "controlName": "deploymentReadinessRollback",
  "source": {
    "repository": "Emmakex/kairoseth-platform",
    "commit": "<40 lowercase hex>",
    "runId": "<GitHub Actions run id>",
    "runAttempt": "<attempt>",
    "rollbackRevision": "<40 lowercase hex>"
  },
  "control": {
    "status": "pass",
    "evidenceSha256": "sha256:<64 lowercase hex>",
    "referenceId": "kairoseth-platform-readiness-rollback-run-<run>-attempt-<attempt>",
    "recordedAt": "2026-10-06T19:30:00Z"
  }
}
```

Only the nested `control` object belongs in `controls.deploymentReadinessRollback` of the infrastructure-security manifest.

## Completion boundary

Merged producer/verifier code and repository CI make this path **READY**, not GREEN. The control is eligible for GREEN only after the protected Kairoseth Platform workflow runs against the actual deployed Kairoseth boundary and the exact retained artifact successfully passes this verifier.
