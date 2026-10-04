import {
  createHash
} from "node:crypto";
import {
  canonicalJson
} from "./canonical-json.mjs";
import {
  ECMR_D25A_PROFILE
} from "../../ecmr-xml/src/d25a-profile.mjs";

export const ECMR_ISSUANCE_READINESS_VERSION =
  "ecmr-issuance-readiness-v1";

const SHA256 =
  /^sha256:[0-9a-f]{64}$/;

const hasText = (
  value
) =>
  typeof value === "string" &&
  value.trim().length > 0;

const exactInstant = (
  value
) => {
  if (!hasText(value)) {
    return false;
  }

  const parsed =
    new Date(value);

  return (
    !Number.isNaN(
      parsed.getTime()
    ) &&
    parsed.toISOString() ===
      value
  );
};

const hash = (
  value
) =>
  `sha256:${createHash("sha256")
    .update(value)
    .digest("hex")}`;

const gate = (
  id,
  passed,
  code,
  message,
  legalBasis
) => ({
  id,
  passed,
  code:
    passed
      ? null
      : code,
  message,
  legalBasis
});

const validSchemaEvidenceHash = (
  evidence
) => {
  if (
    evidence === null ||
    typeof evidence !==
      "object" ||
    Array.isArray(evidence) ||
    !SHA256.test(
      evidence.evidenceSha256 ??
        ""
    )
  ) {
    return false;
  }

  const {
    evidenceSha256,
    ...core
  } = evidence;

  return (
    evidenceSha256 ===
    hash(
      Buffer.from(
        canonicalJson(core),
        "utf8"
      )
    )
  );
};

const schemaGate = (
  evidence,
  contentHash
) => {
  const validation =
    evidence?.validation;

  const passed =
    validSchemaEvidenceHash(
      evidence
    ) &&
    evidence?.evidenceVersion ===
      1 &&
    evidence?.status ===
      "pass" &&
    evidence?.check ===
      "ecmr-d25a-generated-xml-acceptance" &&
    exactInstant(
      evidence?.generatedAt
    ) &&
    SHA256.test(
      evidence
        ?.projectionSha256 ??
        ""
    ) &&
    evidence?.serializer
      ?.release ===
      ECMR_D25A_PROFILE.release &&
    evidence?.serializer
      ?.rootSchema ===
      ECMR_D25A_PROFILE.rootSchema &&
    validation
      ?.schemaConformance ===
      "official-d25a-xsd-pass" &&
    validation?.release ===
      ECMR_D25A_PROFILE.release &&
    validation?.sourceFile ===
      ECMR_D25A_PROFILE.sourceFileName &&
    validation?.sourceFileId ===
      ECMR_D25A_PROFILE.sourceFileId &&
    validation
      ?.nestedSchemaArchive ===
      ECMR_D25A_PROFILE
        .nestedSchemaArchive &&
    validation?.rootSchema ===
      ECMR_D25A_PROFILE.rootSchema &&
    validation?.networkAccess ===
      false &&
    validation?.xmlSha256 ===
      contentHash &&
    SHA256.test(
      validation?.archiveSha256 ??
        ""
    ) &&
    SHA256.test(
      validation
        ?.nestedSchemaArchiveSha256 ??
        ""
    ) &&
    SHA256.test(
      validation
        ?.rootSchemaSha256 ??
        ""
    ) &&
    SHA256.test(
      validation
        ?.schemaTreeSha256 ??
        ""
    ) &&
    Number.isInteger(
      validation?.schemaFileCount
    ) &&
    validation.schemaFileCount >
      0;

  return gate(
    "official_d25a_schema",
    passed,
    "ECMR_ISSUANCE_D25A_XSD_REQUIRED",
    passed
      ? "The immutable XML hash is covered by verified official D25A XSD PASS evidence."
      : "Verified official D25A XSD PASS evidence for this exact immutable XML is required.",
    "UN_CEFACT_ECMR_D25A"
  );
};

const signatureGate = (
  authorization,
  {
    organizationId,
    contentHash
  }
) => {
  const passed =
    authorization
      ?.authorized === true &&
    authorization
      ?.organizationId ===
      organizationId &&
    hasText(
      authorization
        ?.signerKeyId
    ) &&
    SHA256.test(
      authorization
        ?.publicKeyFingerprint ??
        ""
    ) &&
    authorization
      ?.contentHash ===
      contentHash &&
    hasText(
      authorization
        ?.signatureId
    ) &&
    hasText(
      authorization
        ?.method
    ) &&
    exactInstant(
      authorization
        ?.signedAt
    ) &&
    authorization
      ?.custody
      ?.mode ===
      "external" &&
    authorization
      ?.custody
      ?.privateKeyStored ===
      false;

  return gate(
    "authorized_signature",
    passed,
    "ECMR_ISSUANCE_AUTHORIZED_SIGNATURE_REQUIRED",
    passed
      ? "A cryptographically verified signature is bound to an authorized tenant signer and this exact XML."
      : "A cryptographically verified and tenant-authorized signature over this exact XML is required.",
    "ECMR_PROTOCOL_ARTICLE_3"
  );
};

const jurisdictionGate = (
  policy,
  authorization
) => {
  const passed =
    policy?.status ===
      "accepted" &&
    hasText(
      policy?.jurisdiction
    ) &&
    hasText(
      policy?.policyId
    ) &&
    hasText(
      policy?.policyVersion
    ) &&
    exactInstant(
      policy?.acceptedAt
    ) &&
    hasText(
      policy?.identityAssurance
    ) &&
    hasText(
      policy?.custodyModel
    ) &&
    hasText(
      policy?.signatureMethod
    ) &&
    policy?.signerKeyId ===
      authorization
        ?.signerKeyId &&
    policy
      ?.publicKeyFingerprint ===
      authorization
        ?.publicKeyFingerprint &&
    policy
      ?.signatureMethod ===
      authorization?.method &&
    policy
      ?.identityAssurance ===
      authorization
        ?.signer
        ?.identityAssurance &&
    policy
      ?.custodyModel ===
      authorization
        ?.custody
        ?.controlModel;

  return gate(
    "jurisdiction_signature_policy",
    passed,
    "ECMR_ISSUANCE_JURISDICTION_POLICY_REQUIRED",
    passed
      ? "The selected jurisdiction policy explicitly accepts the signer identity assurance, custody model and signature method."
      : "Explicit jurisdiction-specific acceptance of identity assurance, custody and signature method is required.",
    "ECMR_PROTOCOL_ARTICLE_3"
  );
};

const procedureGate = (
  agreement
) => {
  const roles =
    Array.isArray(
      agreement?.partyRoles
    )
      ? new Set(
          agreement.partyRoles
        )
      : new Set();

  const passed =
    agreement?.agreed ===
      true &&
    hasText(
      agreement?.agreementId
    ) &&
    hasText(
      agreement?.procedureVersion
    ) &&
    SHA256.test(
      agreement
        ?.proceduresHash ??
        ""
    ) &&
    exactInstant(
      agreement?.acceptedAt
    ) &&
    hasText(
      agreement
        ?.verificationMethod
    ) &&
    roles.has("sender") &&
    roles.has(
      "contractualCarrier"
    );

  return gate(
    "agreed_operational_procedures",
    passed,
    "ECMR_ISSUANCE_PROCEDURE_AGREEMENT_REQUIRED",
    passed
      ? "The carriage parties have explicit, hash-bound and verifiable eCMR operating procedures."
      : "Explicit and verifiable eCMR operating procedures agreed by sender and contractual carrier are required.",
    "ECMR_PROTOCOL_ARTICLE_5"
  );
};

export function evaluateEcmrIssuanceReadiness({
  organizationId,
  version,
  currentHeadVersionId,
  reviewVerification,
  amendmentVerification,
  schemaAcceptance,
  signatureAuthorization,
  jurisdictionPolicy,
  procedureAgreement
}) {
  const contentHash =
    version?.contentHash;
  const versionId =
    version?.versionId;

  const headPassed =
    hasText(versionId) &&
    versionId ===
      currentHeadVersionId;

  const reviewPassed =
    reviewVerification
      ?.valid === true &&
    reviewVerification
      ?.present === true &&
    reviewVerification
      ?.contentHash ===
      contentHash;

  const amendmentPassed =
    amendmentVerification
      ?.valid === true &&
    amendmentVerification
      ?.latestVersionId ===
      versionId &&
    amendmentVerification
      ?.latestContentHash ===
      contentHash;

  const gates = [
    gate(
      "current_immutable_head",
      headPassed,
      "ECMR_ISSUANCE_CURRENT_HEAD_REQUIRED",
      headPassed
        ? "The requested eCMR version is the current immutable regulatory head."
        : "Only the current immutable eCMR head can become eligible for issuance.",
      "ECMR_PROTOCOL_ARTICLE_4"
    ),
    gate(
      "verified_human_review",
      reviewPassed,
      "ECMR_ISSUANCE_VERIFIED_REVIEW_REQUIRED",
      reviewPassed
        ? "The human-review snapshot is valid and reproduces this exact immutable XML."
        : "A verified structured human-review snapshot reproducing this exact immutable XML is required.",
      "CMR_ARTICLE_6"
    ),
    gate(
      "immutable_amendment_history",
      amendmentPassed,
      "ECMR_ISSUANCE_AMENDMENT_HISTORY_REQUIRED",
      amendmentPassed
        ? "The immutable amendment chain is valid and terminates at this exact XML."
        : "A valid immutable amendment chain terminating at this exact XML is required.",
      "ECMR_PROTOCOL_ARTICLE_4"
    ),
    schemaGate(
      schemaAcceptance,
      contentHash
    ),
    signatureGate(
      signatureAuthorization,
      {
        organizationId,
        contentHash
      }
    ),
    jurisdictionGate(
      jurisdictionPolicy,
      signatureAuthorization
    ),
    procedureGate(
      procedureAgreement
    )
  ];

  const blockingCodes =
    gates
      .filter(
        (entry) =>
          !entry.passed
      )
      .map(
        (entry) =>
          entry.code
      );

  return {
    readinessVersion:
      ECMR_ISSUANCE_READINESS_VERSION,
    ready:
      blockingCodes.length ===
      0,
    status:
      blockingCodes.length ===
      0
        ? "ready"
        : "blocked",
    versionId:
      versionId ?? null,
    contentHash:
      contentHash ?? null,
    gates,
    blockingCodes
  };
}
