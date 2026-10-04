import {
  verifyEcmrAmendmentChain
} from "../../ecmr-amendment/src/amendment-chain.mjs";

const fail = (
  code,
  message
) =>
  Object.assign(
    new Error(message),
    { code }
  );

export function applyEcmrAmendmentChainEvidence(
  projection,
  chain
) {
  if (
    projection === null ||
    typeof projection !==
      "object" ||
    Array.isArray(projection)
  ) {
    throw fail(
      "ECMR_AMENDMENT_PROJECTION_INVALID",
      "eCMR projection must be an object"
    );
  }

  const verification =
    verifyEcmrAmendmentChain(
      chain
    );

  if (!verification.valid) {
    throw fail(
      "ECMR_AMENDMENT_CHAIN_INVALID",
      "A valid immutable amendment chain is required"
    );
  }

  if (
    projection.integrity
      ?.state !== "final" ||
    typeof projection.integrity
      ?.contentHash !==
      "string"
  ) {
    throw fail(
      "ECMR_AMENDMENT_FINAL_FORM_REQUIRED",
      "A final-form content hash must exist before amendment-history evidence can be accepted"
    );
  }

  if (
    projection.integrity
      .contentHash !==
    verification
      .latestContentHash
  ) {
    throw fail(
      "ECMR_AMENDMENT_LATEST_CONTENT_MISMATCH",
      "The signed/final eCMR form does not match the latest preserved amendment version"
    );
  }

  const next =
    structuredClone(
      projection
    );

  next.integrity = {
    ...next.integrity,
    amendmentHistoryPreserved:
      true,
    amendmentChain: {
      formatVersion:
        chain[0]
          .formatVersion,
      versions:
        verification
          .versions,
      originalVersionId:
        verification
          .originalVersionId,
      originalContentHash:
        verification
          .originalContentHash,
      latestVersionId:
        verification
          .latestVersionId,
      latestContentHash:
        verification
          .latestContentHash,
      latestChainHash:
        verification
          .latestChainHash
    }
  };

  return next;
}
