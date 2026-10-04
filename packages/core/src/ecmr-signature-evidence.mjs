import {
  ECMR_SIGNATURE_METHOD
} from "../../ecmr-signature/src/detached-signature.mjs";

const fail = (
  code,
  message
) =>
  Object.assign(
    new Error(message),
    { code }
  );

const requireVerifiedEvidence = (
  evidence,
  verification
) => {
  if (
    evidence === null ||
    typeof evidence !==
      "object" ||
    Array.isArray(evidence) ||
    verification === null ||
    typeof verification !==
      "object" ||
    verification.valid !==
      true ||
    evidence.method !==
      ECMR_SIGNATURE_METHOD ||
    verification.method !==
      ECMR_SIGNATURE_METHOD
  ) {
    throw fail(
      "ECMR_SIGNATURE_VERIFICATION_REQUIRED",
      "Cryptographically verified detached-signature evidence is required"
    );
  }

  for (const key of [
    "signatureId",
    "contentHash",
    "publicKeyFingerprint",
    "signedAt"
  ]) {
    if (
      evidence[key] !==
      verification[key]
    ) {
      throw fail(
        "ECMR_SIGNATURE_VERIFICATION_MISMATCH",
        `Verified signature field does not match evidence: ${key}`
      );
    }
  }

  if (
    JSON.stringify(
      evidence.signer
    ) !==
    JSON.stringify(
      verification.signer
    )
  ) {
    throw fail(
      "ECMR_SIGNATURE_VERIFICATION_MISMATCH",
      "Verified signer identity does not match signature evidence"
    );
  }

  return evidence;
};

export function applyEcmrVerifiedSignatureEvidence(
  projection,
  {
    evidence,
    verification
  }
) {
  if (
    projection === null ||
    typeof projection !==
      "object" ||
    Array.isArray(projection)
  ) {
    throw fail(
      "ECMR_SIGNATURE_PROJECTION_INVALID",
      "eCMR projection must be an object"
    );
  }

  const current =
    requireVerifiedEvidence(
      evidence,
      verification
    );
  const next =
    structuredClone(
      projection
    );
  const existing =
    Array.isArray(
      next.authentication
        ?.signatures
    )
      ? next.authentication
          .signatures
      : [];

  if (
    next.integrity
      ?.contentHash &&
    next.integrity
      .contentHash !==
      current.contentHash
  ) {
    throw fail(
      "ECMR_SIGNATURE_CONTENT_CONFLICT",
      "Signature evidence targets a different final-form content hash"
    );
  }

  const signature = {
    signatureId:
      current.signatureId,
    signerId:
      current.signer
        .signerId,
    partyRole:
      current.signer
        .partyRole,
    identityScheme:
      current.signer
        .identityScheme,
    identityAssurance:
      current.signer
        .identityAssurance,
    algorithm:
      current.algorithm,
    publicKeyFingerprint:
      current
        .publicKeyFingerprint,
    signedAt:
      current.signedAt,
    signatureValue:
      current.signatureValue
  };

  const withoutDuplicate =
    existing.filter(
      (entry) =>
        entry?.signatureId !==
        signature.signatureId
    );

  next.authentication = {
    state:
      "cryptographically-verified",
    method:
      ECMR_SIGNATURE_METHOD,
    signatures: [
      ...withoutDuplicate,
      signature
    ]
  };

  next.integrity = {
    state: "final",
    contentHash:
      current.contentHash,
    amendmentHistoryPreserved:
      next.integrity
        ?.amendmentHistoryPreserved ===
      true
  };

  return next;
}
