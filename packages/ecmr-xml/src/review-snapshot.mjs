import {
  createHash
} from "node:crypto";
import {
  canonicalJson
} from "../../core/src/canonical-json.mjs";
import {
  validateEcmrProjection
} from "../../core/src/validate-ecmr.mjs";
import {
  serializeEcmrD25aEnvelope
} from "./d25a-serializer.mjs";

const hash = (
  value
) =>
  `sha256:${createHash(
    "sha256"
  )
    .update(value)
    .digest("hex")}`;

const invalid = (
  code,
  message,
  details = {}
) => ({
  valid: false,
  present: true,
  code,
  message,
  ...details
});

const isRecord = (
  value
) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

export function createEcmrReviewSnapshot(
  projection
) {
  const validation =
    validateEcmrProjection(
      projection
    );

  if (!validation.valid) {
    const error = new Error(
      "eCMR review snapshot requires a valid Article-6 projection"
    );
    error.code =
      "ECMR_REVIEW_PROJECTION_INVALID";
    error.validationErrors =
      validation.errors;
    throw error;
  }

  const reviewSnapshot =
    structuredClone(
      projection
    );
  const reviewHash =
    hash(
      canonicalJson(
        reviewSnapshot
      )
    );
  const wire =
    serializeEcmrD25aEnvelope(
      reviewSnapshot
    );
  const contentHash =
    hash(
      Buffer.from(
        wire.xml,
        "utf8"
      )
    );

  return {
    reviewSnapshot,
    reviewHash,
    contentHash,
    release:
      wire.release,
    schemaConformance:
      wire.schemaConformance
  };
}

export function verifyEcmrReviewSnapshot({
  reviewSnapshot,
  reviewHash,
  contentHash
}) {
  const snapshotMissing =
    reviewSnapshot ===
      undefined ||
    reviewSnapshot ===
      null;
  const hashMissing =
    reviewHash ===
      undefined ||
    reviewHash === null;

  if (
    snapshotMissing &&
    hashMissing
  ) {
    return {
      valid: true,
      present: false,
      code: null
    };
  }

  if (
    snapshotMissing ||
    hashMissing
  ) {
    return invalid(
      "ECMR_REVIEW_EVIDENCE_INCOMPLETE",
      "eCMR review snapshot and review hash must be stored together"
    );
  }

  if (
    !isRecord(
      reviewSnapshot
    ) ||
    typeof reviewHash !==
      "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(
      reviewHash
    )
  ) {
    return invalid(
      "ECMR_REVIEW_EVIDENCE_INVALID",
      "Stored eCMR review evidence has an invalid shape"
    );
  }

  const validation =
    validateEcmrProjection(
      reviewSnapshot
    );

  if (!validation.valid) {
    return invalid(
      "ECMR_REVIEW_PROJECTION_INVALID",
      "Stored eCMR review projection no longer satisfies the Article-6 contract",
      {
        validationErrors:
          validation.errors
      }
    );
  }

  const calculatedReviewHash =
    hash(
      canonicalJson(
        reviewSnapshot
      )
    );

  if (
    calculatedReviewHash !==
    reviewHash
  ) {
    return invalid(
      "ECMR_REVIEW_HASH_MISMATCH",
      "Stored eCMR review snapshot hash does not match its canonical content"
    );
  }

  let wire;

  try {
    wire =
      serializeEcmrD25aEnvelope(
        reviewSnapshot
      );
  } catch (error) {
    return invalid(
      "ECMR_REVIEW_SERIALIZATION_FAILED",
      "Stored eCMR review snapshot can no longer be serialized",
      {
        causeCode:
          error?.code ?? null
      }
    );
  }

  const calculatedContentHash =
    hash(
      Buffer.from(
        wire.xml,
        "utf8"
      )
    );

  if (
    calculatedContentHash !==
    contentHash
  ) {
    return invalid(
      "ECMR_REVIEW_CONTENT_HASH_MISMATCH",
      "Stored eCMR review snapshot does not reproduce the immutable XML content hash"
    );
  }

  return {
    valid: true,
    present: true,
    code: null,
    reviewHash:
      calculatedReviewHash,
    contentHash:
      calculatedContentHash,
    release:
      wire.release,
    schemaConformance:
      wire.schemaConformance
  };
}
