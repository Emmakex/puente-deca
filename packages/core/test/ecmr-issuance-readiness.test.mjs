import test from "node:test";
import assert from "node:assert/strict";
import {
  createHash
} from "node:crypto";

import {
  canonicalJson
} from "../src/canonical-json.mjs";
import {
  evaluateEcmrIssuanceReadiness
} from "../src/ecmr-issuance-readiness.mjs";
import {
  ECMR_D25A_PROFILE
} from "../../ecmr-xml/src/d25a-profile.mjs";
import {
  ECMR_SIGNATURE_METHOD
} from "../../ecmr-signature/src/detached-signature.mjs";

const HASH_A =
  `sha256:${"a".repeat(64)}`;
const HASH_B =
  `sha256:${"b".repeat(64)}`;
const HASH_C =
  `sha256:${"c".repeat(64)}`;
const HASH_D =
  `sha256:${"d".repeat(64)}`;
const HASH_E =
  `sha256:${"e".repeat(64)}`;

const sha256 = (
  value
) =>
  `sha256:${createHash("sha256")
    .update(value)
    .digest("hex")}`;

const schemaAcceptance = (
  xmlSha256 = HASH_A
) => {
  const core = {
    evidenceVersion: 1,
    status: "pass",
    check:
      "ecmr-d25a-generated-xml-acceptance",
    generatedAt:
      "2026-10-04T19:00:00.000Z",
    projectionSha256:
      HASH_B,
    serializer: {
      release:
        ECMR_D25A_PROFILE.release,
      rootSchema:
        ECMR_D25A_PROFILE.rootSchema,
      mappedProjectionPaths: [
        "issue.date"
      ],
      pendingProjectionPaths: []
    },
    validation: {
      schemaConformance:
        "official-d25a-xsd-pass",
      release:
        ECMR_D25A_PROFILE.release,
      sourceFile:
        ECMR_D25A_PROFILE
          .sourceFileName,
      sourceFileId:
        ECMR_D25A_PROFILE
          .sourceFileId,
      archiveSha256:
        HASH_C,
      nestedSchemaArchive:
        ECMR_D25A_PROFILE
          .nestedSchemaArchive,
      nestedSchemaArchiveSha256:
        HASH_D,
      rootSchema:
        ECMR_D25A_PROFILE
          .rootSchema,
      rootSchemaSha256:
        HASH_E,
      schemaFileCount: 42,
      schemaTreeSha256:
        HASH_B,
      xmlSha256,
      networkAccess: false
    }
  };

  return {
    ...core,
    evidenceSha256:
      sha256(
        Buffer.from(
          canonicalJson(core),
          "utf8"
        )
      )
  };
};

const baseInput = () => ({
  organizationId:
    "org_001",
  version: {
    versionId:
      "ecmrv_001",
    contentHash:
      HASH_A
  },
  currentHeadVersionId:
    "ecmrv_001",
  reviewVerification: {
    valid: true,
    present: true,
    contentHash:
      HASH_A
  },
  amendmentVerification: {
    valid: true,
    latestVersionId:
      "ecmrv_001",
    latestContentHash:
      HASH_A
  },
  schemaAcceptance:
    schemaAcceptance(),
  signatureAuthorization: {
    authorized: true,
    organizationId:
      "org_001",
    signerKeyId:
      "skey_001",
    signatureId:
      "sig_001",
    method:
      ECMR_SIGNATURE_METHOD,
    contentHash:
      HASH_A,
    publicKeyFingerprint:
      HASH_C,
    signedAt:
      "2026-10-04T19:05:00.000Z",
    signer: {
      signerId:
        "kairoseth-user:user_001",
      partyRole:
        "sender",
      identityScheme:
        "kairoseth-user",
      identityAssurance:
        "platform-authenticated"
    },
    custody: {
      mode: "external",
      provider:
        "Qualified provider",
      keyReference:
        "provider://key/001",
      controlModel:
        "external-sole-control",
      privateKeyStored:
        false
    }
  },
  jurisdictionPolicy: {
    status: "accepted",
    jurisdiction:
      "ES/EU",
    policyId:
      "ecmr-es-eu-signature",
    policyVersion:
      "1",
    acceptedAt:
      "2026-10-04T19:06:00.000Z",
    identityAssurance:
      "platform-authenticated",
    custodyModel:
      "external-sole-control",
    signatureMethod:
      ECMR_SIGNATURE_METHOD,
    signerKeyId:
      "skey_001",
    publicKeyFingerprint:
      HASH_C
  },
  procedureAgreement: {
    agreed: true,
    agreementId:
      "agreement_001",
    procedureVersion:
      "1",
    proceduresHash:
      HASH_D,
    acceptedAt:
      "2026-10-04T19:07:00.000Z",
    verificationMethod:
      "kairoseth-agreement-record",
    partyRoles: [
      "sender",
      "contractualCarrier"
    ]
  }
});

test(
  "returns ready only when every issuance gate is satisfied",
  () => {
    const result =
      evaluateEcmrIssuanceReadiness(
        baseInput()
      );

    assert.equal(
      result.ready,
      true
    );
    assert.equal(
      result.status,
      "ready"
    );
    assert.deepEqual(
      result.blockingCodes,
      []
    );
    assert.equal(
      result.gates.length,
      7
    );
    assert.ok(
      result.gates.every(
        (entry) =>
          entry.passed ===
          true
      )
    );
  }
);

test(
  "fails closed when external acceptance evidence is absent",
  () => {
    const input =
      baseInput();

    input.schemaAcceptance =
      null;
    input.signatureAuthorization =
      null;
    input.jurisdictionPolicy =
      null;
    input.procedureAgreement =
      null;

    const result =
      evaluateEcmrIssuanceReadiness(
        input
      );

    assert.equal(
      result.ready,
      false
    );
    assert.equal(
      result.status,
      "blocked"
    );
    assert.deepEqual(
      new Set(
        result.blockingCodes
      ),
      new Set([
        "ECMR_ISSUANCE_D25A_XSD_REQUIRED",
        "ECMR_ISSUANCE_AUTHORIZED_SIGNATURE_REQUIRED",
        "ECMR_ISSUANCE_JURISDICTION_POLICY_REQUIRED",
        "ECMR_ISSUANCE_PROCEDURE_AGREEMENT_REQUIRED"
      ])
    );
  }
);

test(
  "rejects a stale immutable version even when all external gates pass",
  () => {
    const input =
      baseInput();

    input.currentHeadVersionId =
      "ecmrv_002";

    const result =
      evaluateEcmrIssuanceReadiness(
        input
      );

    assert.equal(
      result.ready,
      false
    );
    assert.ok(
      result.blockingCodes
        .includes(
          "ECMR_ISSUANCE_CURRENT_HEAD_REQUIRED"
        )
    );
  }
);

test(
  "rejects official schema evidence that is tampered or targets another XML",
  () => {
    const tampered =
      baseInput();

    tampered
      .schemaAcceptance
      .validation
      .schemaFileCount =
        99;

    const tamperedResult =
      evaluateEcmrIssuanceReadiness(
        tampered
      );

    assert.ok(
      tamperedResult
        .blockingCodes
        .includes(
          "ECMR_ISSUANCE_D25A_XSD_REQUIRED"
        )
    );

    const mismatch =
      baseInput();

    mismatch.schemaAcceptance =
      schemaAcceptance(
        HASH_E
      );

    const mismatchResult =
      evaluateEcmrIssuanceReadiness(
        mismatch
      );

    assert.ok(
      mismatchResult
        .blockingCodes
        .includes(
          "ECMR_ISSUANCE_D25A_XSD_REQUIRED"
        )
    );
  }
);

test(
  "requires jurisdiction acceptance to match the authorized signer key and method",
  () => {
    const input =
      baseInput();

    input
      .jurisdictionPolicy
      .signerKeyId =
        "skey_other";

    const result =
      evaluateEcmrIssuanceReadiness(
        input
      );

    assert.equal(
      result.ready,
      false
    );
    assert.ok(
      result.blockingCodes
        .includes(
          "ECMR_ISSUANCE_JURISDICTION_POLICY_REQUIRED"
        )
    );
  }
);

test(
  "requires explicit verifiable procedures agreed by sender and contractual carrier",
  () => {
    const input =
      baseInput();

    input
      .procedureAgreement
      .partyRoles = [
        "sender"
      ];

    const result =
      evaluateEcmrIssuanceReadiness(
        input
      );

    assert.equal(
      result.ready,
      false
    );
    assert.ok(
      result.blockingCodes
        .includes(
          "ECMR_ISSUANCE_PROCEDURE_AGREEMENT_REQUIRED"
        )
    );

    const procedureGate =
      result.gates.find(
        (entry) =>
          entry.id ===
          "agreed_operational_procedures"
      );

    assert.equal(
      procedureGate
        .legalBasis,
      "ECMR_PROTOCOL_ARTICLE_5"
    );
  }
);
