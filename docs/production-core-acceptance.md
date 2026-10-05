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

## Provision the isolated acceptance fixture

The read-only production acceptance workflows must not create regulatory data or credentials themselves. Prepare the dedicated synthetic fixture first with the repository provisioner:

```bash
export PUENTE_DECA_SERVICE_URL='<internal-engine-url>'
export KAIROSETH_CARGO_ACCEPTANCE_API_KEY_FILE="$HOME/.kairoseth/kairoseth-cargo-production-acceptance.key"

# Inject PUENTE_DECA_SERVICE_SECRET from the protected operations secret store/session.
# Do not paste the secret inline into shell history.

npm run production:kairoseth-cargo-acceptance-fixture
```

Optional overrides:

```text
KAIROSETH_CARGO_ACCEPTANCE_ORGANIZATION_ID=<isolated acceptance organization id>
KAIROSETH_PUBLIC_PRODUCTION_URL=https://kairoseth.com
```

The default organization is `kairoseth-cargo-production-acceptance`. The provisioner:

1. enables the connector-access policy for that isolated organization;
2. reuses the dedicated acceptance API key when it is still valid, otherwise creates a replacement;
3. persists the API key only to `KAIROSETH_CARGO_ACCEPTANCE_API_KEY_FILE` with mode `0600` and never prints it;
4. creates/reuses an idempotent synthetic shipment containing no customer data;
5. generates its DeCA document;
6. downloads the public PDF, validates the PDF signature and size, and calculates its immutable SHA-256;
7. prints only sanitized acceptance values: organization ID, shipment ID, public PDF URL, SHA-256 and API-key file path.

The synthetic shipment deliberately enters the normal DeCA retention lifecycle. Keep it isolated from customer/business records and reuse it for acceptance rather than creating ad-hoc fixtures.

## Workflow inputs

Use the sanitized output of the Kairoseth Cargo acceptance fixture provisioner:

```text
public_pdf_url=https://kairoseth.com/deca/d/<opaque-token>.pdf
public_pdf_sha256=sha256:<64 lowercase hex characters>
confirm=true
```

The provisioner also reports the synthetic `shipmentId` for the private Kairoseth Cargo Engine Production Acceptance workflow. The PDF URL, shipment ID and hash are acceptance evidence, not credentials. The dedicated API key remains only in the protected file and must be transferred to the corresponding protected acceptance secret without printing it.

## Checks executed

The workflow executes the existing fail-closed `production:go-live` command against the real production environment:

1. production configuration preflight;
2. Atlas metadata/index and GridFS round-trip smoke;
3. Atlas concurrency/idempotency/document-version smoke;
4. protected Kairoseth → Puente DeCA health check;
5. canonical public DeCA PDF, TLS, privacy-header, CSP, internal-header leakage and SHA-256 check;
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
