# Automated go-live core acceptance

Puente DeCA provides one command for the production checks that can be verified automatically by the engine:

```bash
npm run production:go-live
```

## Required environment

In addition to the normal production environment, provide:

```text
OPERATIONS_HEALTH_SECRET=<Kairoseth operations-health secret>
DECA_SMOKE_PUBLIC_URL=https://kairoseth.com/deca/d/<controlled-token>.pdf
DECA_SMOKE_EXPECTED_SHA256=sha256:<immutable artifact hash>
```

The controlled DeCA URL must already exist; the command does not create a retained regulatory document merely for smoke testing.

## Kairoseth Cargo acceptance fixture provisioning

The Kairoseth Cargo production acceptance workflow uses only Kairoseth-controlled synthetic data. Customer stores and customer shipment data are not involved.

### Preferred protected GitHub workflow

Use the manual workflow `DeCA Kairoseth Cargo Acceptance Fixture` in the protected GitHub environment `deca-production`.

The workflow requires only this protected environment secret:

```text
OPERATIONS_HEALTH_SECRET=<same operations secret configured in the deployed Kairoseth runtime>
```

Run the workflow from `main` with `confirm=true`.

The workflow deliberately does **not** connect from the GitHub-hosted runner to `PUENTE_DECA_SERVICE_URL` and does not require a persistent acceptance API key. The deployed Kairoseth runtime owns the internal Puente DeCA bridge, including its internal service URL and server-to-server secret. This matters when the production bridge is bound to an internal address such as `http://127.0.0.1:8080`: that address is meaningful only inside the Kairoseth runtime, not from a GitHub-hosted runner.

The protected flow is:

1. the GitHub workflow authenticates to the deployed Kairoseth operations endpoint with `OPERATIONS_HEALTH_SECRET`;
2. Kairoseth creates/reuses the isolated synthetic shipment through its existing internal Puente DeCA server bridge;
3. Kairoseth generates/reuses the retained DeCA and returns only the synthetic `shipmentId` and canonical public PDF URL;
4. the GitHub runner downloads that PDF independently through `https://kairoseth.com`, verifies the PDF signature/size and calculates the immutable SHA-256 from the public edge;
5. sanitized evidence is retained for 90 days with only hashes/metadata and the PDF SHA-256;
6. a separate operator handoff containing `shipmentId`, public synthetic PDF URL and PDF SHA-256 is retained for only 1 day;
7. raw endpoint output, the temporary URL file, handoff file and downloaded PDF are removed from the runner.

The Kairoseth operations endpoint additionally requires the explicit confirmation header `x-kairoseth-acceptance-confirm: synthetic-production-fixture` and is protected by the same constant-time operations-secret authorization used by protected health operations.

The short-lived handoff exists only to populate the next protected acceptance gates. It is not final acceptance evidence and must not be copied into tickets, documentation or long-lived artifacts.

### Local/operator fallback

A local operator bootstrap command remains available for diagnostics or one-off recovery when running in an approved environment that can reach the internal Puente DeCA service directly:

```bash
export PUENTE_DECA_SERVICE_URL="<internal Puente DeCA service URL>"
export PUENTE_DECA_SERVICE_SECRET="<Kairoseth service secret>"
export KAIROSETH_CARGO_ACCEPTANCE_API_KEY_FILE="$HOME/.puente-deca/kairoseth-cargo-acceptance-api-key"
npm run production:kairoseth-cargo-acceptance-fixture
```

This fallback is **not** the preferred GitHub acceptance path. It preserves the original owner-only (`0600`) API-key handling and never prints the API key or service secret.

The dynamic handoff values produced by the preferred protected workflow map to:

```text
KAIROSETH_CARGO_ACCEPTANCE_SHIPMENT_ID
KAIROSETH_CARGO_ACCEPTANCE_PUBLIC_PDF_URL
KAIROSETH_CARGO_ACCEPTANCE_PDF_SHA256
```

`OPERATIONS_HEALTH_SECRET` is an existing Kairoseth production operations secret; the acceptance workflow does not generate or rotate it.

## Production backup → isolated restore acceptance

The manual workflow `DeCA Backup Restore Acceptance` executes the existing one-command DR acceptance against the protected GitHub environment `deca-production`.

Configure these environment secrets:

```text
MONGODB_URI=<production MongoDB connection URI for Kairoseth>
RESTORE_MONGODB_URI=<approved MongoDB connection URI allowed to create the isolated DR database>
```

Protect the `deca-production` environment so only the `main` deployment branch is allowed and, where available, require an approval before execution. The workflow itself checks out `main`, verifies the checked-out SHA, forces the source database name to `kairoseth`, and does not expose either URI in command arguments.

Run the workflow manually with the confirmation input enabled. The workflow:

1. installs MongoDB Database Tools on the ephemeral runner;
2. creates a compressed backup restricted to `kairoseth.deca_*`;
3. verifies the backup SHA-256;
4. restores only into a generated `kairoseth_deca_dr_*` database;
5. verifies required metadata collections, GridFS files/chunks, every PDF signature and SHA-256, metadata-to-artifact links, and reconciliation counts;
6. drops the isolated restore database by default;
7. uploads only sanitized JSON evidence and its checksum for 90 days;
8. removes the backup archive from the runner even when a later step fails.

The production backup archive itself must never be uploaded as a GitHub Actions artifact. `RESTORE_DR_PRESERVE` is fixed to `0` in this workflow; preserving an isolated restore database for inspection remains a separate operator-only diagnostic action, not part of production acceptance.

## Automated order

The command has no skip/bypass switches and runs:

1. production configuration preflight;
2. Atlas metadata + index + GridFS live smoke;
3. Atlas concurrent idempotency + document-version smoke;
4. protected Kairoseth → Puente DeCA health smoke;
5. public Kairoseth PDF/TLS/header/SHA-256 smoke;
6. artifact reconciliation.

Artifact reconciliation is green only when all are zero:

```text
missingBeforeRetention
missingAfterRetention
orphanedArtifacts
purgedArtifactsStillPresent
```

## Output semantics

A green automated result contains:

```json
{
  "status": "ok",
  "check": "puente-deca-go-live",
  "scope": "automated-core-acceptance",
  "productionReady": false
}
```

`productionReady` intentionally remains false while live infrastructure/operational gates are outstanding.

The result also lists `manualGatesRemaining` and a structured `manualGateStatus` array. Each pending gate is labelled either:

- `automation=ready`: the repository/platform already contains the acceptance command or workflow and only the approved Kairoseth-controlled environment/evidence is missing;
- `automation=external`: completion belongs to provider/infrastructure evidence outside the engine runtime.

This distinction prevents "pending execution" from being confused with "development not implemented".

## Gates intentionally separated from the core command

The following remain explicit release gates because the engine core command alone cannot prove them:

- synthetic Kairoseth Cargo acceptance fixture — automation ready through the manual protected `DeCA Kairoseth Cargo Acceptance Fixture` workflow and deployed Kairoseth operations bridge;
- Kairoseth Cargo engine production acceptance — automation ready in the private `kairoseth-platform` workflow `Kairoseth Cargo Engine Production Acceptance`;
- WooCommerce controlled live-store read acceptance — automation ready via the host-local read-only evidence wrapper;
- PrestaShop 1.7.8.x and 8.x controlled live-store read acceptance — automation ready via the host-local read-only evidence wrapper;
- backup → isolated restore drill — automation ready via the manual workflow `DeCA Backup Restore Acceptance` and `production:backup-restore-drill`;
- Hostinger edge technical acceptance — automation ready via the bounded manual Kairoseth edge workflow;
- Hostinger CDN/WAF/provider protection configuration — provider configuration evidence, never a disruptive stress/DDoS test;
- infrastructure security acceptance — fail-closed evidence gate covering Atlas least privilege/network boundary, deployed tenant isolation, deployment isolation/secrets, rollback readiness and Hostinger provider controls;
- focused application penetration/security acceptance — already internal, synthetic and CI-covered; no external pentest is required to declare the agreed DeCA scope complete.

Do not reinterpret a green `production:go-live` result as final launch authorization until every row in `docs/deca-100-percent-acceptance-ledger.md` is green and the final `deca-100` evidence freeze validates successfully.
