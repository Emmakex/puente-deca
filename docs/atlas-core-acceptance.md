# DeCA Atlas core production acceptance

This is the focused live acceptance gate for the DeCA `atlasCore` evidence boundary.

It exists so Atlas/GridFS closure does not depend on re-running the Kairoseth engine or public-PDF edge gates that are already green in the DeCA acceptance ledger.

## Scope

The gate is deliberately **DeCA-only** and runs:

1. production environment preflight;
2. Atlas/GridFS transaction, index and round-trip smoke;
3. DeCA shipment-idempotency and DeCA document-version concurrency smoke;
4. artifact reconciliation with zero accepted anomalies.

It does **not** run eCMR/eFTI regulatory acceptance. Those tracks remain frozen until DeCA reaches 100%.

## Workflow

Run the manual GitHub Actions workflow:

```text
DeCA Atlas Core Acceptance
```

The workflow is protected by the `deca-production` environment and requires the Kairoseth-controlled production secrets already expected by the production preflight:

- `MONGODB_URI`;
- `KAIROSETH_SERVICE_SECRET`.

The non-secret production boundary is fixed by the workflow:

```text
PUBLIC_BASE_URL=https://kairoseth.com/deca
MONGODB_DB_NAME=kairoseth
PERSISTENCE_DRIVER=mongodb
ARTIFACT_DRIVER=gridfs
DECA_GRIDFS_BUCKET=deca_pdf
```

The workflow checks out `main`, requires the checked-out commit to equal `GITHUB_SHA`, and never prints database credentials or service secrets.

## Acceptance command

The workflow executes:

```bash
npm run production:atlas-core-acceptance
```

The command fails closed unless all of these are true:

- production preflight is valid;
- Atlas metadata and GridFS probes succeed;
- required metadata/GridFS indexes match the contract;
- transaction rollback leaves no smoke record;
- GridFS write/read SHA-256 integrity succeeds;
- GridFS smoke cleanup succeeds;
- concurrent shipment idempotency converges to one canonical write;
- concurrent DeCA document versioning converges to one accepted lineage;
- smoke cleanup leaves zero scoped records;
- artifact reconciliation reports zero `missingBeforeRetention`;
- artifact reconciliation reports zero `missingAfterRetention`;
- artifact reconciliation reports zero `orphanedArtifacts`;
- artifact reconciliation reports zero `purgedArtifactsStillPresent`.

## Evidence

A successful run retains:

```text
acceptance-evidence.json
acceptance-evidence.json.sha256
```

The evidence binds the sanitized result to:

- repository;
- exact `main` commit;
- GitHub Actions run ID and attempt;
- UTC recording time;
- the DeCA-only Atlas/GridFS/concurrency/reconciliation result.

No MongoDB URI, API key, service secret or customer payload is included in the retained artifact.

## Ledger rule

This workflow may promote the detailed Atlas transaction/index/concurrency and GridFS lifecycle/reconciliation rows from `READY` to `GREEN` only when the protected live run succeeds and its retained evidence is bound to the intended Kairoseth Atlas environment.

The final `atlasCore` manifest key becomes eligible only after both detailed rows are green. A green Atlas core gate does not imply DR, connector-store, Hostinger provider-security or final evidence-freeze closure.
