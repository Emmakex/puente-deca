import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync
} from "node:crypto";

import {
  createEcmrDetachedSignature,
  verifyEcmrDetachedSignature,
  ECMR_SIGNATURE_ALGORITHM,
  ECMR_SIGNATURE_FORMAT_VERSION,
  ECMR_SIGNATURE_METHOD
} from "../src/detached-signature.mjs";

const XML =
  '<?xml version="1.0" encoding="UTF-8"?><rsm:eCMR xmlns:rsm="urn:un:unece:uncefact:data:standard:eCMR:100"><rsm:ExchangedDocument/></rsm:eCMR>';

const keys = () =>
  generateKeyPairSync(
    "ed25519"
  );

const signer = () => ({
  signerId:
    "ES-B12345678",
  partyRole: "sender",
  identityScheme:
    "tax-id",
  identityAssurance:
    "integration-asserted"
});

test(
  "creates detached evidence binding exact XML hash, key and signer identity",
  () => {
    const {
      privateKey
    } = keys();

    const evidence =
      createEcmrDetachedSignature({
        xml: XML,
        privateKey,
        signer:
          signer(),
        signedAt:
          "2026-10-04T14:15:00.000Z"
      });

    assert.equal(
      evidence.formatVersion,
      ECMR_SIGNATURE_FORMAT_VERSION
    );
    assert.equal(
      evidence.algorithm,
      ECMR_SIGNATURE_ALGORITHM
    );
    assert.equal(
      evidence.method,
      ECMR_SIGNATURE_METHOD
    );
    assert.match(
      evidence.signatureId,
      /^sig_[0-9a-f]{32}$/
    );
    assert.match(
      evidence.contentHash,
      /^sha256:[0-9a-f]{64}$/
    );
    assert.match(
      evidence
        .publicKeyFingerprint,
      /^sha256:[0-9a-f]{64}$/
    );
    assert.doesNotMatch(
      JSON.stringify(
        evidence
      ),
      /PRIVATE KEY/
    );
  }
);

test(
  "verifies valid evidence and rejects one-byte content changes",
  () => {
    const {
      privateKey,
      publicKey
    } = keys();

    const evidence =
      createEcmrDetachedSignature({
        xml: XML,
        privateKey,
        signer:
          signer(),
        signedAt:
          "2026-10-04T14:15:00.000Z"
      });

    assert.equal(
      verifyEcmrDetachedSignature({
        xml: XML,
        evidence,
        publicKey
      }).valid,
      true
    );

    const tampered =
      XML.replace(
        "/>",
        " />"
      );
    const result =
      verifyEcmrDetachedSignature({
        xml: tampered,
        evidence,
        publicKey
      });

    assert.equal(
      result.valid,
      false
    );
    assert.equal(
      result.code,
      "ECMR_SIGNATURE_CONTENT_HASH_MISMATCH"
    );
  }
);

test(
  "treats leading and trailing XML whitespace as signed content",
  () => {
    const {
      privateKey,
      publicKey
    } = keys();
    const exact =
      ` \n${XML}\n `;

    const evidence =
      createEcmrDetachedSignature({
        xml: exact,
        privateKey,
        signer:
          signer(),
        signedAt:
          "2026-10-04T14:15:00.000Z"
      });

    assert.equal(
      verifyEcmrDetachedSignature({
        xml: exact,
        evidence,
        publicKey
      }).valid,
      true
    );

    const changed =
      verifyEcmrDetachedSignature({
        xml:
          exact.trim(),
        evidence,
        publicKey
      });

    assert.equal(
      changed.valid,
      false
    );
    assert.equal(
      changed.code,
      "ECMR_SIGNATURE_CONTENT_HASH_MISMATCH"
    );
  }
);

test(
  "rejects signer metadata tampering because identity is inside the signed statement",
  () => {
    const {
      privateKey,
      publicKey
    } = keys();

    const evidence =
      createEcmrDetachedSignature({
        xml: XML,
        privateKey,
        signer:
          signer(),
        signedAt:
          "2026-10-04T14:15:00.000Z"
      });

    const tampered = {
      ...evidence,
      signer: {
        ...evidence.signer,
        signerId:
          "ES-B99999999"
      }
    };

    const result =
      verifyEcmrDetachedSignature({
        xml: XML,
        evidence:
          tampered,
        publicKey
      });

    assert.equal(
      result.valid,
      false
    );
    assert.equal(
      result.code,
      "ECMR_SIGNATURE_CRYPTOGRAPHIC_VERIFICATION_FAILED"
    );
  }
);

test(
  "rejects a different public key even when the signed content is unchanged",
  () => {
    const first =
      keys();
    const second =
      keys();

    const evidence =
      createEcmrDetachedSignature({
        xml: XML,
        privateKey:
          first.privateKey,
        signer:
          signer(),
        signedAt:
          "2026-10-04T14:15:00.000Z"
      });

    const result =
      verifyEcmrDetachedSignature({
        xml: XML,
        evidence,
        publicKey:
          second.publicKey
      });

    assert.equal(
      result.valid,
      false
    );
    assert.equal(
      result.code,
      "ECMR_SIGNATURE_KEY_FINGERPRINT_MISMATCH"
    );
  }
);

test(
  "rejects malformed signature values before cryptographic verification",
  () => {
    const {
      privateKey,
      publicKey
    } = keys();

    const evidence =
      createEcmrDetachedSignature({
        xml: XML,
        privateKey,
        signer:
          signer(),
        signedAt:
          "2026-10-04T14:15:00.000Z"
      });

    const result =
      verifyEcmrDetachedSignature({
        xml: XML,
        evidence: {
          ...evidence,
          signatureValue:
            "not+base64"
        },
        publicKey
      });

    assert.equal(
      result.valid,
      false
    );
    assert.equal(
      result.code,
      "ECMR_SIGNATURE_VALUE_INVALID"
    );
  }
);

test(
  "requires explicit signer identity and canonical UTC timestamps",
  () => {
    const {
      privateKey
    } = keys();

    assert.throws(
      () =>
        createEcmrDetachedSignature({
          xml: XML,
          privateKey,
          signer: {
            signerId:
              "",
            partyRole:
              "sender",
            identityScheme:
              "tax-id"
          },
          signedAt:
            "2026-10-04T14:15:00.000Z"
        }),
      (error) =>
        error.code ===
          "ECMR_SIGNATURE_INPUT_INVALID"
    );

    assert.throws(
      () =>
        createEcmrDetachedSignature({
          xml: XML,
          privateKey,
          signer:
            signer(),
          signedAt:
            "2026-10-04T14:15:00Z"
        }),
      (error) =>
        error.code ===
        "ECMR_SIGNATURE_SIGNED_AT_INVALID"
    );
  }
);
