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
  applyEcmrDetachedSignatureEvidence
} from "../src/ecmr-signature-evidence.mjs";
import {
  createEcmrDetachedSignature,
  ECMR_SIGNATURE_METHOD
} from "../../ecmr-signature/src/detached-signature.mjs";

const XML =
  "<rsm:eCMR>signed-final-form</rsm:eCMR>";

const evidence = () => {
  const {
    privateKey
  } =
    generateKeyPairSync(
      "ed25519"
    );

  return createEcmrDetachedSignature({
    xml: XML,
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
};

test(
  "binds verified signature evidence into authentication and final-form integrity state",
  () => {
    const projection =
      emptyEcmrProjection();
    const signed =
      applyEcmrDetachedSignatureEvidence(
        projection,
        evidence()
      );

    assert.equal(
      signed.authentication
        .state,
      "authenticated"
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
  "signature evidence alone does not falsely satisfy Protocol Article 4 amendment-history readiness",
  () => {
    const projection =
      emptyEcmrProjection();
    projection.contractVersion =
      "2026-10";
    projection.messageRelease =
      "D25A";

    const signed =
      applyEcmrDetachedSignatureEvidence(
        projection,
        evidence()
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
          "ECMR_PROTOCOL_ARTICLE_4"
      )
    );
  }
);

test(
  "refuses to mix signatures that target different final-form content hashes",
  () => {
    const first =
      evidence();
    const projection =
      applyEcmrDetachedSignatureEvidence(
        emptyEcmrProjection(),
        first
      );
    const second = {
      ...evidence(),
      contentHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    };

    assert.throws(
      () =>
        applyEcmrDetachedSignatureEvidence(
          projection,
          second
        ),
      (error) =>
        error.code ===
        "ECMR_SIGNATURE_CONTENT_CONFLICT"
    );
  }
);
