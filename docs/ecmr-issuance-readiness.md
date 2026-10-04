# eCMR production issuance readiness

Puente DeCA exposes a fail-closed readiness boundary before any production eCMR signing/issuance action is allowed.

This boundary **does not issue, sign, publish or mutate** the eCMR. It evaluates whether the current immutable eCMR head has all of the technical and externally accepted evidence required by the product policy.

## Endpoint

```text
POST /v1/shipments/{shipmentId}/ecmr/versions/{versionId}/issuance-readiness
authentication: Kairoseth Platform service context only
```

Connector API credentials cannot call this endpoint, even when they hold regulatory read/write scopes.

Raw XML and private-key material are never returned.

## Seven fail-closed gates

The evaluator returns `ready=true` only when all seven gates pass:

| Gate | Requirement | Basis |
| --- | --- | --- |
| Current immutable head | The requested version is the current accepted eCMR head. | e-CMR Protocol Article 4 integrity lifecycle |
| Verified human review | The persisted structured review is valid and reserializes to the exact immutable XML hash. | CMR Article 6 particulars |
| Immutable amendment history | The complete chain verifies and terminates at the exact requested content hash. | e-CMR Protocol Article 4 |
| Official D25A schema | Hash-bound evidence records `official-d25a-xsd-pass` for the exact immutable XML hash using the pinned UNECE D25A profile. | UN/CEFACT eCMR D25A |
| Authorized signature | The detached Ed25519 signature verifies against the tenant-registered public key and targets the exact immutable XML. | e-CMR Protocol Article 3 |
| Jurisdiction signature policy | A Kairoseth-supplied accepted policy matches the actual signer key, signature method, identity-assurance level and external custody control model. | Deployment/jurisdiction acceptance for Article 3 |
| Agreed operational procedures | Sender and contractual carrier have explicit, hash-bound, verifiable eCMR procedures. | e-CMR Protocol Article 5 |

A single failed or absent gate produces:

```text
status = blocked
ready  = false
blockingCodes = [...]
```

There is no partial-ready state.

## Evidence derived by Puente DeCA

The caller cannot self-assert these items:

- current regulatory head;
- immutable amendment-chain validity;
- human-review integrity;
- signature cryptographic validity;
- signer-key registration/authorization;
- signer-key validity/revocation state;
- XML content hash.

For signature verification the caller provides a detached signature evidence object and a registered `signerKeyId`. Puente DeCA loads the stored public verification key internally and performs both cryptographic verification and tenant authorization.

## Official D25A acceptance evidence

The schema gate requires the evidence shape emitted by the controlled D25A acceptance process.

It verifies:

- canonical evidence SHA-256;
- PASS status/check identity;
- D25A release;
- pinned official source file/file ID;
- pinned nested schema archive and root XSD;
- outer/nested/root/tree hashes;
- non-empty schema inventory count;
- `networkAccess=false`;
- `xmlSha256` equals the immutable eCMR version content hash.

A hash-valid PASS for another XML cannot make the version ready.

## Jurisdiction policy attestation

`jurisdictionPolicy` is an explicit Kairoseth/platform policy attestation. It must identify:

- jurisdiction;
- policy ID/version;
- acceptance time;
- accepted identity-assurance profile;
- accepted custody model;
- accepted signature method;
- signer-key ID;
- public-key fingerprint.

The accepted identity-assurance value and custody model must match the actual authorized signer record. The signature method, key ID and fingerprint must also match the verified signature.

Puente DeCA does not treat this object as an independent legal opinion. It is the auditable deployment-policy input required by the product gate.

## Article 5 procedure agreement

`procedureAgreement` requires:

- `agreed=true`;
- agreement ID;
- procedure version;
- SHA-256 of the agreed procedures;
- exact acceptance time;
- a verification method/reference;
- explicit party roles including `sender` and `contractualCarrier`.

A jurisdiction or carriage workflow may require additional parties; the product minimum does not prevent recording them.

## Result

A successful evaluation resembles:

```json
{
  "ready": true,
  "status": "ready",
  "versionId": "ecmrv_...",
  "contentHash": "sha256:...",
  "gates": [
    { "id": "current_immutable_head", "passed": true },
    { "id": "verified_human_review", "passed": true },
    { "id": "immutable_amendment_history", "passed": true },
    { "id": "official_d25a_schema", "passed": true },
    { "id": "authorized_signature", "passed": true },
    { "id": "jurisdiction_signature_policy", "passed": true },
    { "id": "agreed_operational_procedures", "passed": true }
  ],
  "blockingCodes": []
}
```

Even `ready=true` is still a **precondition** for a later issuance action. This module contains no issuance side effect.

## Remaining production work

The readiness boundary is implemented, but actual production issuance remains intentionally blocked until the external/live gates are closed, including:

- a real PASS against the official UNECE D25A XSD bundle with preserved evidence;
- accepted production jurisdiction/signature/custody policy and signing-provider integration;
- required live Atlas concurrency/DR evidence;
- final issuance persistence/UI and issued-artifact lifecycle.
