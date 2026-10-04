# eCMR detached cryptographic signatures

Phase 7 now contains a cryptographic evidence core for eCMR. This is deliberately narrower than a claim that an eCMR is legally authenticated or electronically issued.

## Protocol boundary

The Additional Protocol to CMR requires an electronic consignment note to be authenticated by the parties through a reliable electronic-signature mechanism, with the signature linked to the note and changes detectable. Integrity and amendment preservation are a separate requirement.

Puente DeCA therefore keeps three states separate:

1. **cryptographic verification** — implemented;
2. **authorized signer/key policy** — implemented internally with tenant-scoped public-key registration, external custody metadata, validity windows, rotation and revocation;
3. **jurisdiction-specific authentication acceptance** — intentionally still pending external/legal acceptance.

Immutable amendment-history preservation is implemented separately in the regulatory-version ledger. A valid Ed25519 signature plus a locally authorized signer key still does not, by itself, constitute jurisdiction-specific legal acceptance.

## Signature profile

Current internal profile:

```text
formatVersion = ecmr-detached-signature-v1
algorithm     = Ed25519
method        = detached-ed25519-bound-statement-v1
domain        = PUENTE-DECA-ECMR-SIGNATURE-V1
```

The signature covers a deterministic statement containing:

- SHA-256 of the **exact UTF-8 XML bytes**;
- SHA-256 fingerprint of the Ed25519 public key in SPKI DER form;
- signer ID;
- signer party role;
- signer identity scheme;
- optional identity-assurance label;
- exact UTC signing instant.

This means changes to the XML, verification key, signer ID, role, identity scheme or signing time invalidate the signature.

The XML itself is not normalized or reserialized by the signature module. One-byte changes produce a different content hash.

## Evidence

`createEcmrDetachedSignature()` returns public evidence only:

```text
formatVersion
algorithm
method
signatureId
signer
signedAt
contentHash
publicKeyFingerprint
signatureValue
```

It never returns or logs the private key.

The verification key is supplied separately to `verifyEcmrDetachedSignature()`. Verification fails closed for:

- content-hash mismatch;
- wrong verification key/fingerprint;
- unsupported profile;
- malformed signature;
- modified signer metadata;
- invalid signature ID;
- cryptographic verification failure.

## Projection binding

Signature evidence cannot be written into the eCMR authentication/integrity state merely because it has the right shape.

`applyEcmrVerifiedSignatureEvidence()` requires both:

- the original detached evidence; and
- a matching `verification.valid=true` result produced by cryptographic verification.

The projection then records:

```text
authentication.state = cryptographically-verified
authentication.method = detached-ed25519-bound-statement-v1
integrity.state = final
integrity.contentHash = <signed SHA-256>
integrity.amendmentHistoryPreserved = false
```

The signature bridge intentionally does not infer amendment-history readiness from a signature. Amendment-history preservation is established independently by the immutable regulatory-version chain.

## Identity and key custody

The signed `signerId`, `partyRole` and `identityScheme` are cryptographically bound assertions. Puente DeCA now also provides a tenant-scoped authorization registry that binds an Ed25519 public key fingerprint to:

- one Kairoseth organization;
- an explicit signer identity and party role;
- optional identity-assurance metadata;
- an authorization validity interval;
- external custody provider/reference/control metadata;
- revocation state;
- rotation lineage.

The policy version is:

```text
ecmr-signer-authorization-v1
```

Puente DeCA accepts **public verification keys only**. Private-key custody is deliberately outside Puente DeCA/Kairoseth:

```text
custody.mode = external
custody.privateKeyStored = false
```

The registry rejects non-Ed25519 public keys, internal custody mode, duplicate organization + public-key fingerprints, invalid validity windows and rotations that reuse the same key.

At signature-evaluation time, authorization additionally requires:

- cryptographic verification already succeeded;
- evidence/verification fingerprint matches the registered public key;
- signer ID, party role, identity scheme and assurance match the authorization record;
- signing instant falls within the key validity window;
- signing instant predates revocation, when revoked.

A successful internal result deliberately records:

```text
jurisdictionAcceptance = pending
```

That prevents an internally authorized key from being confused with a jurisdiction-specific legal/signature-policy acceptance.

## Kairoseth administration boundary

Signer-key administration is available only through authenticated Kairoseth Platform service context:

```text
GET  /v1/ecmr/signer-keys
POST /v1/ecmr/signer-keys
POST /v1/ecmr/signer-keys/{signerKeyId}/rotate
POST /v1/ecmr/signer-keys/{signerKeyId}/revoke
```

Connector API credentials cannot administer signer keys.

Public API responses return signer metadata and the public-key fingerprint but omit the stored public-key PEM. Private-key material is never accepted, returned, logged or persisted.

Both JSON development persistence and MongoDB production persistence support this lifecycle. MongoDB uses the dedicated `deca_ecmr_signer_keys` collection with unique signer-key IDs and unique organization + fingerprint constraints. Registration, revocation and rotation produce audit events and the collection is included in backup/restore DR acceptance.

## Remaining legal acceptance

The engineering policy for registration, external custody metadata, validity, rotation and revocation is implemented. Production issuance remains blocked until the intended jurisdiction/signature policy confirms what identity assurance and signature/custody mechanism is acceptable for the deployment.

This repository therefore does **not** claim that `ecmr-signer-authorization-v1` is, by itself, a qualified or otherwise legally accepted electronic-signature scheme.
