# DeCA Atlas core production acceptance

This is the focused live acceptance gate for the DeCA `atlasCore` evidence boundary.

It exists so Atlas/GridFS closure does not depend on re-running the Kairoseth engine or public-PDF edge gates that are already green in the DeCA acceptance ledger.

## Scope

The gate is deliberately **DeCA-only** and runs inside the Kairoseth Hostinger application runtime:

1. production environment preflight with explicit `in-process` topology;
2. Atlas/GridFS transaction, index and round-trip smoke;
3. DeCA shipment-idempotency and DeCA document-version concurrency smoke;
4. artifact reconciliation with zero accepted anomalies.

It does **not** run eCMR/eFTI regulatory acceptance. Those tracks remain frozen until DeCA reaches 100%.

## Execution topology

Run the manual GitHub Actions workflow:

```text
DeCA Atlas Core Acceptance
```

The workflow is protected by the `deca-production` environment and requires explicit confirmation. GitHub Actions receives only the protected operations credential:

```text
OPERATIONS_HEALTH_SECRET
```

The workflow deliberately does **not** receive `MONGODB_URI` or `KAIROSETH_SERVICE_SECRET` and does not connect directly to MongoDB Atlas. Database/runtime credentials remain inside the Kairoseth-controlled Hostinger environment.

After checking out the exact `main` revision and validating the operations secret, GitHub sends a bounded authenticated request to:

```text
POST https://kairoseth.com/api/operations/deca/atlas-core-acceptance
x-kairoseth-acceptance-confirm: deca-atlas-core-production
```

The Kairoseth endpoint executes the Atlas acceptance in the Hostinger process and returns the canonical runtime marker:

```text
runtime=hostinger-in-process
```

This boundary keeps GitHub as the protected orchestration/evidence surface while Atlas connectivity and database secrets remain local to Kairoseth/Hostinger.

## In-process acceptance

Inside the Hostinger runtime, `scripts/production/atlas-core-acceptance.mjs` orchestrates the DeCA-only checks. Its production preflight is explicitly invoked with:

```text
--topology=in-process
```

The acceptance fails closed unless all of these are true:

- production preflight is valid for the in-process topology;
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

The GitHub workflow independently validates the returned contract before accepting the run. Non-200 failures expose only bounded, whitelisted diagnostic fields such as the failing step/cause code; raw database URIs, tokens and provider secrets are not retained.

## Evidence

A successful run retains for 90 days:

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

The transient Hostinger response is deleted after the run. No MongoDB URI, API key, service secret or customer payload is included in the retained artifact.

## Ledger rule

This workflow may promote the detailed Atlas transaction/index/concurrency and GridFS lifecycle/reconciliation rows from `READY` to `GREEN` only when the protected live run succeeds and its retained evidence is bound to the intended Kairoseth Atlas environment.

The final `atlasCore` manifest key becomes eligible only after both detailed rows are green. A green Atlas core gate does not imply DR, connector-store, Hostinger provider-security or final evidence-freeze closure.
