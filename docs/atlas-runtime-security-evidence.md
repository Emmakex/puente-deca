# DeCA Atlas and runtime security evidence

This runbook prepares the three remaining provider/runtime controls in the DeCA infrastructure-security bundle:

- `atlasLeastPrivilege`
- `atlasNetworkAccess`
- `runtimeSecretScope`

It is DeCA-only. It does not advance eCMR/eFTI.

## Evidence boundary

Retain three sanitized evidence files outside Git:

1. **Atlas database-user role evidence**: enough to prove the application identity is scoped to the `kairoseth` database with the `readWrite` database role only and no additional/admin roles. Do not retain the username, password or connection string.
2. **Atlas network-access evidence**: enough to prove the intended runtime path is allowlisted/private/peered, with no wildcard `/0` or public-any-source ingress. Do not copy actual IP addresses/CIDRs/private endpoint identifiers into the inspection manifest.
3. **Runtime secret-scope evidence**: enough to prove Hostinger production variables and the GitHub `deca-production` environment are reviewed, secrets stay server-side, and acceptance secrets are injected only into the steps that require them. Do not retain secret values.

The evidence files may be sanitized screenshots, exports or text/PDF records. Each is SHA-256 bound by the inspection manifest.

## Why `readWrite` on `kairoseth` only

The deployed DeCA store reads/writes metadata, runs transactions and uses GridFS. It also creates/verifies indexes at startup. MongoDB's database-scoped `readWrite` role includes data operations plus `createIndex`/`listIndexes`, so the service identity does not require `dbAdmin`, `clusterAdmin`, `userAdmin`, `root`, Atlas project administration, or access to other databases.

This gate fails closed if any additional database/admin role is recorded.

## Network rule

Accepted connectivity modes are:

- `ip-access-list`
- `private-endpoint`
- `network-peering`

Whichever mode is used, evidence must prove:

- only the intended Kairoseth runtime path is accepted;
- wildcard ingress is absent;
- public-any-source ingress is absent;
- the smallest practical boundary has been reviewed;
- TLS is required;
- temporary human/break-glass access expires.

Do not solve Hostinger connectivity by allowing `0.0.0.0/0` or another `/0` range. If the production hosting/network model cannot support a restricted source boundary, keep `atlasNetworkAccess` pending rather than weakening this gate.

## Runtime secret model

Kairoseth Cargo runs in-process in the existing Hostinger Node application. It does not require a second Puente DeCA service URL, port or production bridge secret.

The runtime inspection must prove:

- Hostinger production environment configuration has been reviewed;
- GitHub environment is `deca-production` and has been reviewed;
- `MONGODB_URI` is server-only;
- `OPERATIONS_HEALTH_SECRET` is server-only;
- the standalone acceptance `KAIROSETH_SERVICE_SECRET` is step-scoped where the protected Puente workflow requires it;
- no production bridge secret is required by the in-process runtime;
- no secret values are committed to the repository;
- no secret is exposed to browser code;
- secrets are not injected job-wide when only individual workflow steps need them.

## Inspection manifest

Create a sanitized JSON file alongside the retained evidence:

```json
{
  "schemaVersion": 1,
  "check": "deca-atlas-runtime-security-inspection",
  "recordedAt": "2026-10-06T20:00:00Z",
  "scope": "kairoseth-production",
  "referenceId": "atlas-runtime-security-YYYYMMDD",
  "roleEvidenceSha256": "sha256:<role evidence hash>",
  "networkEvidenceSha256": "sha256:<network evidence hash>",
  "runtimeSecretEvidenceSha256": "sha256:<runtime evidence hash>",
  "controls": {
    "atlasLeastPrivilege": {
      "database": "kairoseth",
      "databaseRole": "readWrite",
      "databaseScopeOnly": true,
      "dataReadWriteRequired": true,
      "indexManagementRequired": true,
      "transactionsRequired": true,
      "gridFsRequired": true,
      "additionalDatabaseRoles": false,
      "clusterAdmin": false,
      "userAdmin": false,
      "projectAdmin": false,
      "rootRole": false
    },
    "atlasNetworkAccess": {
      "connectivityMode": "ip-access-list",
      "intendedRuntimeOnly": true,
      "wildcardIngress": false,
      "publicAnySource": false,
      "smallestPracticalBoundaryReviewed": true,
      "tlsRequired": true,
      "temporaryHumanAccessExpires": true
    },
    "runtimeSecretScope": {
      "runtimeModel": "hostinger-in-process-node",
      "hostingerEnvironmentReviewed": true,
      "githubEnvironment": "deca-production",
      "githubEnvironmentReviewed": true,
      "mongodbUriServerOnly": true,
      "operationsHealthSecretServerOnly": true,
      "standaloneAcceptanceSecretStepScoped": true,
      "productionBridgeSecretRequired": false,
      "repositorySecretValuesCommitted": false,
      "browserSecretExposure": false,
      "jobWideSecretInjection": false
    }
  },
  "providerEvidenceContainsSecrets": false,
  "customerDataRetained": false
}
```

Never add usernames, passwords, MongoDB URIs, tokens, API keys, IP addresses, CIDRs, private endpoint IDs or customer data to this manifest.

## Verify and promote

Run from the exact Puente DeCA release checkout:

```bash
node scripts/production/atlas-runtime-security-evidence-verify.mjs \
  --inspection=/secure/path/atlas-runtime-security-inspection.json \
  --role-evidence=/secure/path/atlas-role-evidence.pdf \
  --network-evidence=/secure/path/atlas-network-evidence.pdf \
  --runtime-secret-evidence=/secure/path/runtime-secret-scope-evidence.pdf
```

A successful result emits exactly three four-field controls. Copy only those nested control objects into the matching controls of the six-control infrastructure-security manifest.

All three controls use the SHA-256 of the inspection manifest as their retained evidence digest. The inspection manifest in turn binds the exact three sanitized provider/runtime evidence files, so changing either the assertions or any evidence bytes invalidates the promotion.

## Completion boundary

Repository CI makes these paths **READY**, not GREEN. Each control becomes eligible for GREEN only when the intended Atlas/Hostinger/GitHub production configuration has been inspected, sanitized evidence has been retained, hashes match, and this verifier passes on the exact retained bytes.
