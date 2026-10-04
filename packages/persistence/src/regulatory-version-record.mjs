const SHA256 =
  /^sha256:[0-9a-f]{64}$/;

const requireText = (
  value,
  name
) => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      `${name} is required`
    );
  }

  return value.trim();
};

const requireExactXml = (
  value
) => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      "record.xml is required"
    );
  }

  return value;
};

const requireHash = (
  value,
  name
) => {
  const normalized =
    requireText(
      value,
      name
    );

  if (!SHA256.test(normalized)) {
    throw new TypeError(
      `${name} must be sha256:<hex>`
    );
  }

  return normalized;
};

const requireRecord = (
  value,
  name
) => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(
      `${name} must be an object`
    );
  }

  return value;
};

const requireInstant = (
  value,
  name
) => {
  const normalized =
    requireText(
      value,
      name
    );
  const date =
    new Date(normalized);

  if (
    Number.isNaN(
      date.getTime()
    ) ||
    date.toISOString() !==
      normalized
  ) {
    throw new TypeError(
      `${name} must be an exact ISO-8601 UTC instant with milliseconds`
    );
  }

  return normalized;
};

const optionalText = (
  value,
  name
) =>
  value === null ||
  value === undefined
    ? null
    : requireText(
        value,
        name
      );

const optionalHash = (
  value,
  name
) =>
  value === null ||
  value === undefined
    ? null
    : requireHash(
        value,
        name
      );

const normalizeReviewEvidence = (
  record
) => {
  const snapshotMissing =
    record.reviewSnapshot ===
      undefined ||
    record.reviewSnapshot ===
      null;
  const hashMissing =
    record.reviewHash ===
      undefined ||
    record.reviewHash ===
      null;

  if (
    snapshotMissing &&
    hashMissing
  ) {
    return {
      reviewSnapshot: null,
      reviewHash: null
    };
  }

  if (
    snapshotMissing ||
    hashMissing
  ) {
    throw new TypeError(
      "record.reviewSnapshot and record.reviewHash must be provided together"
    );
  }

  return {
    reviewSnapshot:
      structuredClone(
        requireRecord(
          record.reviewSnapshot,
          "record.reviewSnapshot"
        )
      ),
    reviewHash:
      requireHash(
        record.reviewHash,
        "record.reviewHash"
      )
  };
};

export function normalizeRegulatoryVersionRecord(
  input
) {
  const record =
    requireRecord(
      input,
      "record"
    );

  const version =
    Number(record.version);

  if (
    !Number.isInteger(version) ||
    version < 1
  ) {
    throw new TypeError(
      "record.version must be a positive integer"
    );
  }

  const actor =
    requireRecord(
      record.actor,
      "record.actor"
    );
  const reviewEvidence =
    normalizeReviewEvidence(
      record
    );

  const normalized = {
    formatVersion:
      requireText(
        record.formatVersion,
        "record.formatVersion"
      ),
    versionId:
      requireText(
        record.versionId,
        "record.versionId"
      ),
    version,
    createdAt:
      requireInstant(
        record.createdAt,
        "record.createdAt"
      ),
    actor: {
      actorId:
        requireText(
          actor.actorId,
          "record.actor.actorId"
        ),
      partyRole:
        requireText(
          actor.partyRole,
          "record.actor.partyRole"
        ),
      identityScheme:
        requireText(
          actor.identityScheme,
          "record.actor.identityScheme"
        )
    },
    reason:
      requireText(
        record.reason,
        "record.reason"
      ),
    xml:
      requireExactXml(
        record.xml
      ),
    contentHash:
      requireHash(
        record.contentHash,
        "record.contentHash"
      ),
    originalContentHash:
      requireHash(
        record.originalContentHash,
        "record.originalContentHash"
      ),
    previousVersionId:
      optionalText(
        record.previousVersionId,
        "record.previousVersionId"
      ),
    previousContentHash:
      optionalHash(
        record.previousContentHash,
        "record.previousContentHash"
      ),
    previousChainHash:
      optionalHash(
        record.previousChainHash,
        "record.previousChainHash"
      ),
    chainHash:
      requireHash(
        record.chainHash,
        "record.chainHash"
      ),
    reviewSnapshot:
      reviewEvidence
        .reviewSnapshot,
    reviewHash:
      reviewEvidence
        .reviewHash
  };

  if (version === 1) {
    if (
      normalized.previousVersionId !==
        null ||
      normalized.previousContentHash !==
        null ||
      normalized.previousChainHash !==
        null ||
      normalized.originalContentHash !==
        normalized.contentHash
    ) {
      throw new TypeError(
        "first regulatory version must self-anchor and have no predecessor"
      );
    }
  } else if (
    normalized.previousVersionId ===
      null ||
    normalized.previousContentHash ===
      null ||
    normalized.previousChainHash ===
      null
  ) {
    throw new TypeError(
      "non-initial regulatory version requires complete predecessor linkage"
    );
  }

  return normalized;
}

export function assertRegulatoryVersionAppend({
  latest,
  next
}) {
  if (!latest) {
    if (next.version !== 1) {
      const error =
        new Error(
          "First regulatory version must be version 1"
        );
      error.code =
        "REGULATORY_VERSION_HEAD_CONFLICT";
      throw error;
    }
    return;
  }

  if (
    next.version !==
      latest.version + 1 ||
    next.previousVersionId !==
      latest.versionId ||
    next.previousContentHash !==
      latest.contentHash ||
    next.previousChainHash !==
      latest.chainHash ||
    next.originalContentHash !==
      latest.originalContentHash
  ) {
    const error =
      new Error(
        "Regulatory version does not extend the current accepted head"
      );
    error.code =
      "REGULATORY_VERSION_HEAD_CONFLICT";
    throw error;
  }
}

export function normalizeRegulatoryType(
  value
) {
  const normalized =
    requireText(
      value,
      "regulatoryType"
    )
      .toLowerCase();

  if (
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(
      normalized
    )
  ) {
    throw new TypeError(
      "regulatoryType must be a lowercase-compatible slug"
    );
  }

  return normalized;
}
