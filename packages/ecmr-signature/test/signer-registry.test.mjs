import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync
} from "node:crypto";

import {
  createEcmrDetachedSignature,
  verifyEcmrDetachedSignature
} from "../src/detached-signature.mjs";
import {
  ECMR_SIGNER_POLICY_VERSION,
  createAuthorizedEcmrSignerKey,
  evaluateAuthorizedEcmrSignature,
  publicEcmrSignerKey,
  revokeAuthorizedEcmrSignerKey,
  rotateAuthorizedEcmrSignerKey
} from "../src/signer-registry.mjs";

const signer = {
  signerId:
    "kairoseth-user:user_001",
  partyRole:
    "sender",
  identityScheme:
    "kairoseth-user",
  identityAssurance:
    "platform-authenticated"
};

const custody = {
  mode: "external",
  provider:
    "Example External HSM",
  keyReference:
    "hsm://tenant/key-001",
  controlModel:
    "external-sole-control"
};

const makeKey = () =>
  generateKeyPairSync(
    "ed25519"
  );

test(
  "registers only public Ed25519 material with external custody metadata",
  () => {
    const pair =
      makeKey();
    const record =
      createAuthorizedEcmrSignerKey({
        signerKeyId:
          "skey_001",
        organizationId:
          "org_001",
        label:
          "Sender signing key",
        publicKey:
          pair.publicKey,
        signer,
        custody,
        validFrom:
          "2026-10-04T18:00:00.000Z",
        createdAt:
          "2026-10-04T18:00:00.000Z"
      });
    const publicRecord =
      publicEcmrSignerKey(
        record
      );

    assert.equal(
      record.policyVersion,
      ECMR_SIGNER_POLICY_VERSION
    );
    assert.match(
      record
        .publicKeyFingerprint,
      /^sha256:[0-9a-f]{64}$/
    );
    assert.match(
      record.publicKeyPem,
      /BEGIN PUBLIC KEY/
    );
    assert.equal(
      record.custody
        .privateKeyStored,
      false
    );
    assert.equal(
      Object.hasOwn(
        publicRecord,
        "publicKeyPem"
      ),
      false
    );
    assert.equal(
      JSON.stringify(
        record
      ).includes(
        "PRIVATE KEY"
      ),
      false
    );
  }
);

test(
  "rejects private key custody inside Puente DeCA",
  () => {
    const pair =
      makeKey();

    assert.throws(
      () =>
        createAuthorizedEcmrSignerKey({
          signerKeyId:
            "skey_001",
          organizationId:
            "org_001",
          label:
            "Bad custody",
          publicKey:
            pair.publicKey,
          signer,
          custody: {
            ...custody,
            mode:
              "internal"
          },
          validFrom:
            "2026-10-04T18:00:00.000Z",
          createdAt:
            "2026-10-04T18:00:00.000Z"
        }),
      (error) =>
        error.code ===
        "ECMR_SIGNER_CUSTODY_MODE_INVALID"
    );
  }
);

test(
  "authorizes a verified signature only while its registered key is valid",
  () => {
    const pair =
      makeKey();
    const xml =
      "<rsm:eCMR>example</rsm:eCMR>";
    const evidence =
      createEcmrDetachedSignature({
        xml,
        privateKey:
          pair.privateKey,
        signer,
        signedAt:
          "2026-10-04T18:30:00.000Z"
      });
    const verification =
      verifyEcmrDetachedSignature({
        xml,
        evidence,
        publicKey:
          pair.publicKey
      });
    const key =
      createAuthorizedEcmrSignerKey({
        signerKeyId:
          "skey_001",
        organizationId:
          "org_001",
        label:
          "Sender signing key",
        publicKey:
          pair.publicKey,
        signer,
        custody,
        validFrom:
          "2026-10-04T18:00:00.000Z",
        validUntil:
          "2026-10-05T18:00:00.000Z",
        createdAt:
          "2026-10-04T18:00:00.000Z"
      });

    const accepted =
      evaluateAuthorizedEcmrSignature({
        signerKey:
          key,
        evidence,
        verification
      });

    assert.equal(
      accepted.authorized,
      true
    );
    assert.equal(
      accepted
        .jurisdictionAcceptance,
      "pending"
    );
    assert.equal(
      accepted
        .custody
        .privateKeyStored,
      false
    );
    assert.equal(
      accepted.signatureId,
      evidence.signatureId
    );
    assert.equal(
      accepted.method,
      evidence.method
    );
    assert.equal(
      accepted.contentHash,
      evidence.contentHash
    );

    const revoked =
      revokeAuthorizedEcmrSignerKey(
        key,
        {
          revokedAt:
            "2026-10-04T18:20:00.000Z",
          reason:
            "compromised"
        }
      );
    const rejected =
      evaluateAuthorizedEcmrSignature({
        signerKey:
          revoked,
        evidence,
        verification
      });

    assert.equal(
      rejected.authorized,
      false
    );
    assert.equal(
      rejected.code,
      "ECMR_SIGNER_KEY_NOT_VALID_AT_SIGNING_TIME"
    );
  }
);

test(
  "rotates to a different key and preserves explicit lineage",
  () => {
    const first =
      makeKey();
    const second =
      makeKey();
    const current =
      createAuthorizedEcmrSignerKey({
        signerKeyId:
          "skey_001",
        organizationId:
          "org_001",
        label:
          "Sender signing key",
        publicKey:
          first.publicKey,
        signer,
        custody,
        validFrom:
          "2026-10-04T18:00:00.000Z",
        createdAt:
          "2026-10-04T18:00:00.000Z"
      });
    const rotation =
      rotateAuthorizedEcmrSignerKey(
        current,
        {
          signerKeyId:
            "skey_002",
          label:
            "Sender signing key v2",
          publicKey:
            second.publicKey,
          custody: {
            ...custody,
            keyReference:
              "hsm://tenant/key-002"
          },
          rotatedAt:
            "2026-10-05T09:00:00.000Z",
          reason:
            "scheduled rotation"
        }
      );

    assert.equal(
      rotation.previous
        .revokedAt,
      "2026-10-05T09:00:00.000Z"
    );
    assert.equal(
      rotation.previous
        .revokedReason,
      "scheduled rotation"
    );
    assert.equal(
      rotation.next
        .replacesSignerKeyId,
      "skey_001"
    );
    assert.notEqual(
      rotation.next
        .publicKeyFingerprint,
      current
        .publicKeyFingerprint
    );
  }
);

test(
  "rejects identity metadata that differs from the authorized signer record",
  () => {
    const pair =
      makeKey();
    const xml =
      "<rsm:eCMR>example</rsm:eCMR>";
    const evidence =
      createEcmrDetachedSignature({
        xml,
        privateKey:
          pair.privateKey,
        signer: {
          ...signer,
          signerId:
            "kairoseth-user:other"
        },
        signedAt:
          "2026-10-04T18:30:00.000Z"
      });
    const verification =
      verifyEcmrDetachedSignature({
        xml,
        evidence,
        publicKey:
          pair.publicKey
      });
    const key =
      createAuthorizedEcmrSignerKey({
        signerKeyId:
          "skey_001",
        organizationId:
          "org_001",
        label:
          "Sender signing key",
        publicKey:
          pair.publicKey,
        signer,
        custody,
        validFrom:
          "2026-10-04T18:00:00.000Z",
        createdAt:
          "2026-10-04T18:00:00.000Z"
      });

    const result =
      evaluateAuthorizedEcmrSignature({
        signerKey:
          key,
        evidence,
        verification
      });

    assert.equal(
      result.authorized,
      false
    );
    assert.equal(
      result.code,
      "ECMR_SIGNER_IDENTITY_NOT_AUTHORIZED"
    );
  }
);
