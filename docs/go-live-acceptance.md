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

`productionReady` intentionally remains false while manual/external gates are outstanding.

The result also lists `manualGatesRemaining`.

## Gates intentionally not automated here

The following remain explicit release gates because the engine alone cannot prove them:

- WooCommerce live-store smoke;
- PrestaShop 1.7.8 + 8.x compatibility smoke;
- backup → isolated restore drill;
- edge/reverse-proxy volumetric protection;
- live infrastructure security review;
- focused external penetration test.

Do not reinterpret a green `production:go-live` result as final launch authorization until those gates are also complete.
