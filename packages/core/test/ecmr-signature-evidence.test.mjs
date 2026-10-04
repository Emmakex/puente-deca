import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync
} from "node:crypto";

import {
  emptyEcmrProjection
} from "../../contracts/src/ecmr.mjs";
import {
  validateEcmrElectronicReadiness
} from "../src/validate-ecmr.mjs";
import {
  applyEcmrVerifiedSignatureEvidence
} from "../src/ecmr-signature-evidence.mjs";
import {
  createEcmrDetachedSignature,
  verifyEcmrDetachedSignature,
  ECMR_SIGNATURE_METHOD
} from "../../ecmr-signature/src/detached-signature.mjs";

const XML =
  "<rsm:eCMR>signed-final-form</rsm:eCMR>";

const signedEvidence = (
  xml = XML
) => {
  const {
    privateKey,
    publicKey
  } =
    generateKeyPairSync(
      "ed25519"
    );

  const evidence =
    createEcmrDetachedSignature({
      xml,
      privateKey,
      signer: {
        signerId:
          "ES-B12345678",
        partyRole: "sender",
        identityScheme:
          "tax-id",
        identityAssurance:
          "integration-asserted"
      },
      signedAt:
        "2026-10-04T14:15:00.000Z"
    });
  const verification =
    verifyEcmrDetachedSignature({
      xml,
      evidence,
      publicKey
    });

  assert.equal(
    verification.valid,
    true
  );

  return {
    evidence,
    verification
  };
};

test(
  "binds only verified signature evidence into authentication and final-form integrity state",
  () => {
    const projection =
      emptyEcmrProjection();
    const signed =
      applyEcmrVerifiedSignatureEvidence(
        projection,
        signedEvidence()
      );

    assert.equal(
      signed.authentication
        .state,
      "cryptographically-verified"
    );
    assert.equal(
      signed.authentication
        .method,
      ECMR_SIGNATURE_METHOD
    );
    assert.equal(
      signed.authentication
        .signatures.length,
      1
    );
    assert.equal(
      signed.authentication
        .signatures[0]
        .partyRole,
      "sender"
    );
    assert.match(
      signed.integrity
        .contentHash,
      /^sha256:[0-9a-f]{64}$/
    );
    assert.equal(
      signed.integrity
        .state,
      "final"
    );
    assert.equal(
      signed.integrity
        .amendmentHistoryPreserved,
      false
    );
  }
);

test(
  "refuses unverified evidence even if its shape looks correct",
  () => {
    const current =
      signedEvidence();

    assert.throws(
      () =>
        applyEcmrVerifiedSignatureEvidence(
          emptyEcmrProjection(),
          {
            evidence:
              current.evidence,
            verification: {
              ...current.verification,
              valid: false
            }
          }
        ),
      (error) =>
        error.code ===
        "ECMR_SIGNATURE_VERIFICATION_REQUIRED"
    );
  }
);

test(
  "cryptographic evidence alone does not falsely satisfy Protocol Articles 3 or 4 readiness",
  () => {
    const projection =
      emptyEcmrProjection();
    const signed =
      applyEcmrVerifiedSignatureEvidence(
        projection,
        signedEvidence()
      );
    const result =
      validateEcmrElectronicReadiness(
        signed
      );

    assert.equal(
      result.valid,
      false
    );
    assert.ok(
      result.errors.some(
        (entry) =>
          entry.legalBasis ===
          "ECMR_PROTOCOL_ARTICLE_3"
      )
    );
    assert.ok(
      result.errors.some(
        (entry) =>
          entry.legalBasis ===
          "ECMR_PROTOCOL_ARTICLE_4"
      )
    );
  }
);

test(
  "refuses to mix verified signatures that target different final-form content hashes",
  () => {
    const projection =
      applyEcmrVerifiedSignatureEvidence(
        emptyEcmrProjection(),
        signedEvidence()
      );
    const second =
      signedEvidence(
        "<rsm:eCMR>different-final-form</rsm:eCMR>"
      );

    assert.throws(
      () =>
        applyEcmrVerifiedSignatureEvidence(
          projection,
          second
        ),
      (error) =>
        error.code ===
        "ECMR_SIGNATURE_CONTENT_CONFLICT"
    );
  }
);
