import {
  createHash,
  randomUUID
} from "node:crypto";
import {
  canonicalJson
} from "../../core/src/canonical-json.mjs";

export const ECMR_AMENDMENT_FORMAT_VERSION =
  "ecmr-amendment-chain-v1";

const fail = (
  code,
  message,
  details = {}
) =>
  Object.assign(
    new Error(message),
    {
      code,
      ...details
    }
  );

const requireText = (
  value,
  name
) => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw fail(
      "ECMR_AMENDMENT_INPUT_INVALID",
      `${name} is required`
    );
  }

  return value.trim();
};

const exactXml = (
  xml
) => {
  if (
    typeof xml !== "string" ||
    xml.trim().length === 0
  ) {
    throw fail(
      "ECMR_AMENDMENT_INPUT_INVALID",
      "xml is required"
    );
  }

  return xml;
};

const sha256 = (
  value
) =>
  `sha256:${createHash(
    "sha256"
  )
    .update(value)
    .digest("hex")}`;

const contentHash = (
  xml
) =>
  sha256(
    Buffer.from(
      exactXml(xml),
      "utf8"
    )
  );

const normalizeActor = (
  actor
) => {
  if (
    actor === null ||
    typeof actor !==
      "object" ||
    Array.isArray(actor)
  ) {
    throw fail(
      "ECMR_AMENDMENT_ACTOR_INVALID",
      "Amendment actor must be an object"
    );
  }

  return {
    actorId:
      requireText(
        actor.actorId,
        "actor.actorId"
      ),
    partyRole:
      requireText(
        actor.partyRole,
        "actor.partyRole"
      ),
    identityScheme:
      requireText(
        actor.identityScheme,
        "actor.identityScheme"
      )
  };
};

const normalizeInstant = (
  value,
  name
) => {
  const instant =
    requireText(
      value,
      name
    );
  const parsed =
    new Date(instant);

  if (
    Number.isNaN(
      parsed.getTime()
    ) ||
    parsed.toISOString() !==
      instant
  ) {
    throw fail(
      "ECMR_AMENDMENT_TIME_INVALID",
      `${name} must be an exact ISO-8601 UTC instant with milliseconds`
    );
  }

  return instant;
};

const chainHashPayload = (
  record
) => ({
  formatVersion:
    record.formatVersion,
  versionId:
    record.versionId,
  version:
    record.version,
  createdAt:
    record.createdAt,
  actor:
    record.actor,
  reason:
    record.reason,
  contentHash:
    record.contentHash,
  originalContentHash:
    record.originalContentHash,
  previousVersionId:
    record.previousVersionId,
  previousContentHash:
    record.previousContentHash,
  previousChainHash:
    record.previousChainHash
});

const calculateChainHash = (
  record
) =>
  sha256(
    canonicalJson(
      chainHashPayload(
        record
      )
    )
  );

const createRecord = ({
  xml,
  version,
  versionId,
  createdAt,
  actor,
  reason,
  originalContentHash,
  previousVersionId,
  previousContentHash,
  previousChainHash
}) => {
  const record = {
    formatVersion:
      ECMR_AMENDMENT_FORMAT_VERSION,
    versionId:
      requireText(
        versionId,
        "versionId"
      ),
    version,
    createdAt:
      normalizeInstant(
        createdAt,
        "createdAt"
      ),
    actor:
      normalizeActor(
        actor
      ),
    reason:
      requireText(
        reason,
        "reason"
      ),
    xml:
      exactXml(xml),
    contentHash:
      contentHash(xml),
    originalContentHash,
    previousVersionId,
    previousContentHash,
    previousChainHash
  };

  record.chainHash =
    calculateChainHash(
      record
    );

  return record;
};

export function createEcmrAmendmentChain({
  xml,
  actor,
  reason,
  createdAt,
  idFactory = randomUUID
}) {
  const hash =
    contentHash(xml);
  const record =
    createRecord({
      xml,
      version: 1,
      versionId:
        `ecmrv_${idFactory()}`,
      createdAt,
      actor,
      reason,
      originalContentHash:
        hash,
      previousVersionId:
        null,
      previousContentHash:
        null,
      previousChainHash:
        null
    });

  return [
    record
  ];
}

const invalid = (
  code,
  index,
  message
) => ({
  valid: false,
  code,
  index,
  message
});

export function verifyEcmrAmendmentChain(
  chain
) {
  if (
    !Array.isArray(chain) ||
    chain.length < 1
  ) {
    return invalid(
      "ECMR_AMENDMENT_CHAIN_EMPTY",
      null,
      "Amendment chain must contain at least the original version"
    );
  }

  const seenIds =
    new Set();
  const original =
    chain[0];

  for (
    let index = 0;
    index < chain.length;
    index += 1
  ) {
    const record =
      chain[index];

    if (
      record === null ||
      typeof record !==
        "object" ||
      Array.isArray(record)
    ) {
      return invalid(
        "ECMR_AMENDMENT_RECORD_INVALID",
        index,
        "Amendment record must be an object"
      );
    }

    if (
      record.formatVersion !==
      ECMR_AMENDMENT_FORMAT_VERSION
    ) {
      return invalid(
        "ECMR_AMENDMENT_FORMAT_MISMATCH",
        index,
        "Unsupported amendment-chain format"
      );
    }

    if (
      record.version !==
      index + 1
    ) {
      return invalid(
        "ECMR_AMENDMENT_VERSION_SEQUENCE_INVALID",
        index,
        "Amendment versions must be contiguous and ordered"
      );
    }

    if (
      typeof record.versionId !==
        "string" ||
      record.versionId
        .trim()
        .length === 0 ||
      seenIds.has(
        record.versionId
      )
    ) {
      return invalid(
        "ECMR_AMENDMENT_VERSION_ID_INVALID",
        index,
        "Amendment version IDs must be non-empty and unique"
      );
    }
    seenIds.add(
      record.versionId
    );

    try {
      normalizeInstant(
        record.createdAt,
        "createdAt"
      );
      normalizeActor(
        record.actor
      );
      requireText(
        record.reason,
        "reason"
      );
      exactXml(
        record.xml
      );
    } catch (error) {
      return invalid(
        error?.code ??
          "ECMR_AMENDMENT_RECORD_INVALID",
        index,
        error?.message ??
          "Amendment record is invalid"
      );
    }

    const expectedContentHash =
      contentHash(
        record.xml
      );

    if (
      record.contentHash !==
      expectedContentHash
    ) {
      return invalid(
        "ECMR_AMENDMENT_CONTENT_HASH_MISMATCH",
        index,
        "Stored amendment content hash does not match the exact XML"
      );
    }

    if (
      index === 0
    ) {
      if (
        record.originalContentHash !==
          record.contentHash ||
        record.previousVersionId !==
          null ||
        record.previousContentHash !==
          null ||
        record.previousChainHash !==
          null
      ) {
        return invalid(
          "ECMR_AMENDMENT_ORIGINAL_LINK_INVALID",
          index,
          "Original amendment record must self-anchor and have no predecessor"
        );
      }
    } else {
      const previous =
        chain[index - 1];

      if (
        record.originalContentHash !==
          original.contentHash
      ) {
        return invalid(
          "ECMR_AMENDMENT_ORIGINAL_HASH_CHANGED",
          index,
          "Every amendment must preserve the original content hash"
        );
      }

      if (
        record.previousVersionId !==
          previous.versionId ||
        record.previousContentHash !==
          previous.contentHash ||
        record.previousChainHash !==
          previous.chainHash
      ) {
        return invalid(
          "ECMR_AMENDMENT_PREVIOUS_LINK_MISMATCH",
          index,
          "Amendment predecessor linkage is not intact"
        );
      }

      if (
        new Date(
          record.createdAt
        ).getTime() <=
        new Date(
          previous.createdAt
        ).getTime()
      ) {
        return invalid(
          "ECMR_AMENDMENT_TIME_ORDER_INVALID",
          index,
          "Amendment timestamps must increase strictly"
        );
      }
    }

    const expectedChainHash =
      calculateChainHash(
        record
      );

    if (
      record.chainHash !==
      expectedChainHash
    ) {
      return invalid(
        "ECMR_AMENDMENT_CHAIN_HASH_MISMATCH",
        index,
        "Amendment metadata/link hash is not intact"
      );
    }
  }

  const latest =
    chain[
      chain.length - 1
    ];

  return {
    valid: true,
    code: null,
    versions:
      chain.length,
    originalVersionId:
      original.versionId,
    originalContentHash:
      original.contentHash,
    latestVersionId:
      latest.versionId,
    latestContentHash:
      latest.contentHash,
    latestChainHash:
      latest.chainHash
  };
}

export function appendEcmrAmendment({
  chain,
  xml,
  actor,
  reason,
  createdAt,
  idFactory = randomUUID
}) {
  const verification =
    verifyEcmrAmendmentChain(
      chain
    );

  if (!verification.valid) {
    throw fail(
      "ECMR_AMENDMENT_CHAIN_INVALID",
      "Cannot append to an invalid amendment chain",
      {
        verification
      }
    );
  }

  const previous =
    chain[
      chain.length - 1
    ];
  const nextHash =
    contentHash(xml);

  if (
    nextHash ===
    previous.contentHash
  ) {
    throw fail(
      "ECMR_AMENDMENT_NO_CHANGE",
      "An amendment must change the exact XML content"
    );
  }

  const instant =
    normalizeInstant(
      createdAt,
      "createdAt"
    );

  if (
    new Date(
      instant
    ).getTime() <=
    new Date(
      previous.createdAt
    ).getTime()
  ) {
    throw fail(
      "ECMR_AMENDMENT_TIME_ORDER_INVALID",
      "New amendment timestamp must be later than the previous version"
    );
  }

  const next =
    createRecord({
      xml,
      version:
        previous.version + 1,
      versionId:
        `ecmrv_${idFactory()}`,
      createdAt:
        instant,
      actor,
      reason,
      originalContentHash:
        chain[0]
          .contentHash,
      previousVersionId:
        previous.versionId,
      previousContentHash:
        previous.contentHash,
      previousChainHash:
        previous.chainHash
    });

  return [
    ...structuredClone(
      chain
    ),
    next
  ];
}
