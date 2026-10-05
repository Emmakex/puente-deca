# DeCA production core acceptance

The manual GitHub Actions workflow `DeCA Production Core Acceptance` is the audited execution path for `npm run production:go-live`.

## Protected environment

Use the GitHub environment `deca-production`. Restrict that environment to the `main` deployment branch and require approval where available.

Environment secrets:

```text
MONGODB_URI=<production Kairoseth MongoDB/Atlas URI>
KAIROSETH_SERVICE_SECRET=<Puente DeCA service secret, at least 32 characters>
OPERATIONS_HEALTH_SECRET=<Kairoseth protected health secret, at least 32 characters>
```

The workflow does not expose these secrets to checkout, Node setup, or artifact-upload actions. They are scoped only to the shell steps that validate/run the acceptance.

## Workflow inputs

Use the output of the isolated Kairoseth Cargo acceptance fixture provisioner:

```text
public_pdf_url=https://kairoseth.com/deca/d/<opaque-token>.pdf
public_pdf_sha256=sha256:<64 lowercase hex characters>
confirm=true
```

The PDF URL and hash are acceptance evidence, not credentials.

## Checks executed

The workflow executes the existing fail-closed `production:go-live` command against the real production environment:

1. production configuration preflight;
2. Atlas metadata/index and GridFS round-trip smoke;
3. Atlas concurrency/idempotency/document-version smoke;
4. protected Kairoseth → Puente DeCA health check;
5. canonical public DeCA PDF, TLS, privacy-header and SHA-256 check;
6. artifact reconciliation with zero accepted anomalies.

The Atlas smoke uses temporary test data and verifies cleanup/transaction rollback before returning green.

## Evidence

A successful run uploads only:

```text
acceptance-evidence.json
acceptance-evidence.json.sha256
```

The evidence records repository, commit, Actions run identifiers, timestamp and the sanitized `production:go-live` result. Retention is 90 days. No MongoDB URI, service secret, health secret, API key or PDF contents are uploaded.

A green core result still intentionally reports remaining manual/external gates. It is not final launch authorization by itself.
