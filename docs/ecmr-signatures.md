# eCMR detached cryptographic signatures

Phase 7 now contains a cryptographic evidence core for eCMR. This is deliberately narrower than a claim that an eCMR is legally authenticated or electronically issued.

## Protocol boundary

The Additional Protocol to CMR requires an electronic consignment note to be authenticated by the parties through a reliable electronic-signature mechanism, with the signature linked to the note and changes detectable. Integrity and amendment preservation are a separate requirement.

Puente DeCA therefore keeps three states separate:

1. **cryptographic verification** — implemented here;
2. **identity/authentication policy acceptance** — pending production/national policy integration;
3. **amendment-history preservation** — pending the next Phase 7 block.

A valid Ed25519 signature alone does not make the projection pass `validateEcmrElectronicReadiness()`.

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

The last value intentionally remains false. The next Phase 7 block must implement immutable amendment/version history before Protocol Article 4 can be considered ready.

## Identity and key custody

The signed `signerId`, `partyRole` and `identityScheme` are cryptographically bound assertions. They are **not**, by themselves, proof that an authority or qualified trust provider validated the person or company behind the key.

Production readiness still needs an explicit policy for:

- how a public key is registered to an authorized signer;
- acceptable identity assurance;
- key custody / sole-control requirements;
- revocation or key rotation;
- jurisdiction-specific authentication/signature requirements.

No private-key generation or custody mechanism is introduced into Kairoseth by this module. Production keys remain an external responsibility until that policy is selected.
