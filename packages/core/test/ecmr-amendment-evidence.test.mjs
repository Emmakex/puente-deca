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
  applyEcmrAmendmentChainEvidence
} from "../src/ecmr-amendment-evidence.mjs";
import {
  createEcmrDetachedSignature,
  verifyEcmrDetachedSignature
} from "../../ecmr-signature/src/detached-signature.mjs";
import {
  createEcmrAmendmentChain,
  appendEcmrAmendment
} from "../../ecmr-amendment/src/amendment-chain.mjs";

const XML_1 =
  "<rsm:eCMR><ram:Content>original</ram:Content></rsm:eCMR>";
const XML_2 =
  "<rsm:eCMR><ram:Content>corrected</ram:Content></rsm:eCMR>";

const actor = () => ({
  actorId:
    "ES-B12345678",
  partyRole: "sender",
  identityScheme:
    "tax-id"
});

const signedProjection = (
  xml
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
        "2026-10-04T14:30:00.000Z"
    });
  const verification =
    verifyEcmrDetachedSignature({
      xml,
      evidence,
      publicKey
    });

  return applyEcmrVerifiedSignatureEvidence(
    emptyEcmrProjection(),
    {
      evidence,
      verification
    }
  );
};

const chain = () => {
  const original =
    createEcmrAmendmentChain({
      xml: XML_1,
      actor:
        actor(),
      reason:
        "initial issue",
      createdAt:
        "2026-10-04T14:20:00.000Z",
      idFactory:
        () => "one"
    });

  return appendEcmrAmendment({
    chain:
      original,
    xml: XML_2,
    actor:
      actor(),
    reason:
      "corrected consignee",
    createdAt:
      "2026-10-04T14:25:00.000Z",
    idFactory:
      () => "two"
  });
};

test(
  "marks amendment history preserved only when the signed final form matches the latest chain version",
  () => {
    const projection =
      signedProjection(
        XML_2
      );
    const next =
      applyEcmrAmendmentChainEvidence(
        projection,
        chain()
      );

    assert.equal(
      next.integrity
        .amendmentHistoryPreserved,
      true
    );
    assert.equal(
      next.integrity
        .amendmentChain
        .versions,
      2
    );
    assert.equal(
      next.integrity
        .amendmentChain
        .originalContentHash,
      chain()[0]
        .contentHash
    );
  }
);

test(
  "rejects a valid history whose latest version is not the signed final form",
  () => {
    const projection =
      signedProjection(
        XML_1
      );

    assert.throws(
      () =>
        applyEcmrAmendmentChainEvidence(
          projection,
          chain()
        ),
      (error) =>
        error.code ===
        "ECMR_AMENDMENT_LATEST_CONTENT_MISMATCH"
    );
  }
);

test(
  "Article 4 history gate clears while Article 3 identity-policy gate remains pending",
  () => {
    const projection =
      applyEcmrAmendmentChainEvidence(
        signedProjection(
          XML_2
        ),
        chain()
      );
    const readiness =
      validateEcmrElectronicReadiness(
        projection
      );

    assert.equal(
      readiness.valid,
      false
    );
    assert.ok(
      readiness.errors.some(
        (entry) =>
          entry.legalBasis ===
          "ECMR_PROTOCOL_ARTICLE_3"
      )
    );
    assert.ok(
      !readiness.errors.some(
        (entry) =>
          entry.legalBasis ===
          "ECMR_PROTOCOL_ARTICLE_4"
      )
    );
  }
);
