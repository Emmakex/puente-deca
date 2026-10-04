import {
  ECMR_SIGNATURE_METHOD
} from "../../ecmr-signature/src/detached-signature.mjs";

const requireEvidence = (
  evidence
) => {
  if (
    evidence === null ||
    typeof evidence !==
      "object" ||
    Array.isArray(evidence) ||
    evidence.method !==
      ECMR_SIGNATURE_METHOD ||
    typeof evidence
      .signatureId !==
      "string" ||
    evidence.signatureId
      .trim()
      .length === 0 ||
    typeof evidence
      .contentHash !==
      "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(
      evidence.contentHash
    )
  ) {
    const error = new Error(
      "Verified detached-signature evidence is required"
    );
    error.code =
      "ECMR_SIGNATURE_EVIDENCE_INVALID";
    throw error;
  }

  return evidence;
};

export function applyEcmrDetachedSignatureEvidence(
  projection,
  evidence
) {
  if (
    projection === null ||
    typeof projection !==
      "object" ||
    Array.isArray(projection)
  ) {
    const error = new Error(
      "eCMR projection must be an object"
    );
    error.code =
      "ECMR_SIGNATURE_PROJECTION_INVALID";
    throw error;
  }

  const current =
    requireEvidence(
      evidence
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
    const error = new Error(
      "Signature evidence targets a different final-form content hash"
    );
    error.code =
      "ECMR_SIGNATURE_CONTENT_CONFLICT";
    throw error;
  }

  const signature = {
    signatureId:
      current.signatureId,
    signerId:
      current.signer
        ?.signerId ??
      null,
    partyRole:
      current.signer
        ?.partyRole ??
      null,
    identityScheme:
      current.signer
        ?.identityScheme ??
      null,
    identityAssurance:
      current.signer
        ?.identityAssurance ??
      null,
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
      "authenticated",
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
