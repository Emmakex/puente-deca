import {
  createHash,
  createPublicKey
} from "node:crypto";

export const ECMR_SIGNER_POLICY_VERSION =
  "ecmr-signer-authorization-v1";

const fail = (
  code,
  message
) =>
  Object.assign(
    new Error(message),
    { code }
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
      "ECMR_SIGNER_POLICY_INPUT_INVALID",
      `${name} is required`
    );
  }

  return value.trim();
};

const optionalText = (
  value
) =>
  value === null ||
  value === undefined ||
  value === ""
    ? null
    : requireText(
        value,
        "optional value"
      );

const exactInstant = (
  value,
  name
) => {
  const normalized =
    requireText(
      value,
      name
    );
  const parsed =
    new Date(
      normalized
    );

  if (
    Number.isNaN(
      parsed.getTime()
    ) ||
    parsed.toISOString() !==
      normalized
  ) {
    throw fail(
      "ECMR_SIGNER_POLICY_TIME_INVALID",
      `${name} must be an exact ISO-8601 UTC instant with milliseconds`
    );
  }

  return normalized;
};

const optionalInstant = (
  value,
  name
) =>
  value === null ||
  value === undefined ||
  value === ""
    ? null
    : exactInstant(
        value,
        name
      );

const publicKeyDetails = (
  value
) => {
  let key;

  try {
    key =
      value &&
      typeof value ===
        "object" &&
      value.type ===
        "public" &&
      typeof value.export ===
        "function"
        ? value
        : createPublicKey(
            value
          );
  } catch {
    throw fail(
      "ECMR_SIGNER_PUBLIC_KEY_INVALID",
      "A valid public verification key is required"
    );
  }

  if (
    key.type !== "public" ||
    key.asymmetricKeyType !==
      "ed25519"
  ) {
    throw fail(
      "ECMR_SIGNER_KEY_TYPE_INVALID",
      "Authorized eCMR signer keys must be Ed25519 public keys"
    );
  }

  const der =
    key.export({
      type: "spki",
      format: "der"
    });
  const pem =
    key.export({
      type: "spki",
      format: "pem"
    })
      .toString();

  return {
    publicKeyPem: pem,
    publicKeyFingerprint:
      `sha256:${createHash("sha256")
        .update(der)
        .digest("hex")}`
  };
};

const normalizeSigner = (
  signer
) => {
  if (
    signer === null ||
    typeof signer !==
      "object" ||
    Array.isArray(
      signer
    )
  ) {
    throw fail(
      "ECMR_SIGNER_IDENTITY_INVALID",
      "Signer identity must be an object"
    );
  }

  return {
    signerId:
      requireText(
        signer.signerId,
        "signer.signerId"
      ),
    partyRole:
      requireText(
        signer.partyRole,
        "signer.partyRole"
      ),
    identityScheme:
      requireText(
        signer.identityScheme,
        "signer.identityScheme"
      ),
    identityAssurance:
      optionalText(
        signer
          .identityAssurance
      )
  };
};

const normalizeCustody = (
  custody
) => {
  if (
    custody === null ||
    typeof custody !==
      "object" ||
    Array.isArray(
      custody
    )
  ) {
    throw fail(
      "ECMR_SIGNER_CUSTODY_INVALID",
      "External key-custody metadata must be an object"
    );
  }

  if (
    custody.mode !==
      "external"
  ) {
    throw fail(
      "ECMR_SIGNER_CUSTODY_MODE_INVALID",
      "Puente DeCA only accepts external private-key custody"
    );
  }

  return {
    mode: "external",
    provider:
      requireText(
        custody.provider,
        "custody.provider"
      ),
    keyReference:
      requireText(
        custody.keyReference,
        "custody.keyReference"
      ),
    controlModel:
      requireText(
        custody.controlModel,
        "custody.controlModel"
      ),
    privateKeyStored:
      false
  };
};

export function createAuthorizedEcmrSignerKey({
  signerKeyId,
  organizationId,
  label,
  publicKey,
  signer,
  custody,
  validFrom,
  validUntil = null,
  createdAt,
  replacesSignerKeyId = null
}) {
  const key =
    publicKeyDetails(
      publicKey
    );
  const from =
    exactInstant(
      validFrom,
      "validFrom"
    );
  const until =
    optionalInstant(
      validUntil,
      "validUntil"
    );

  if (
    until &&
    new Date(
      until
    ) <=
      new Date(
        from
      )
  ) {
    throw fail(
      "ECMR_SIGNER_VALIDITY_INVALID",
      "validUntil must be later than validFrom"
    );
  }

  return {
    policyVersion:
      ECMR_SIGNER_POLICY_VERSION,
    signerKeyId:
      requireText(
        signerKeyId,
        "signerKeyId"
      ),
    organizationId:
      requireText(
        organizationId,
        "organizationId"
      ),
    label:
      requireText(
        label,
        "label"
      ),
    signer:
      normalizeSigner(
        signer
      ),
    publicKeyPem:
      key.publicKeyPem,
    publicKeyFingerprint:
      key.publicKeyFingerprint,
    custody:
      normalizeCustody(
        custody
      ),
    validFrom:
      from,
    validUntil:
      until,
    createdAt:
      exactInstant(
        createdAt,
        "createdAt"
      ),
    replacesSignerKeyId:
      optionalText(
        replacesSignerKeyId
      ),
    revokedAt: null,
    revokedReason:
      null
  };
}

export function publicEcmrSignerKey(
  record
) {
  const {
    publicKeyPem:
      _publicKeyPem,
    ...safe
  } =
    structuredClone(
      record
    );

  return safe;
}

export function revokeAuthorizedEcmrSignerKey(
  record,
  {
    revokedAt,
    reason
  }
) {
  if (
    record.revokedAt
  ) {
    return structuredClone(
      record
    );
  }

  const at =
    exactInstant(
      revokedAt,
      "revokedAt"
    );

  if (
    new Date(at) <
    new Date(
      record.validFrom
    )
  ) {
    throw fail(
      "ECMR_SIGNER_REVOCATION_TIME_INVALID",
      "A signer key cannot be revoked before it becomes valid"
    );
  }

  return {
    ...structuredClone(
      record
    ),
    revokedAt:
      at,
    revokedReason:
      requireText(
        reason,
        "reason"
      )
  };
}

export function rotateAuthorizedEcmrSignerKey(
  record,
  {
    signerKeyId,
    label,
    publicKey,
    custody,
    rotatedAt,
    validUntil = null,
    reason =
      "key rotation"
  }
) {
  if (
    record.revokedAt
  ) {
    throw fail(
      "ECMR_SIGNER_KEY_ALREADY_REVOKED",
      "A revoked signer key cannot be rotated"
    );
  }

  const at =
    exactInstant(
      rotatedAt,
      "rotatedAt"
    );

  const previous =
    revokeAuthorizedEcmrSignerKey(
      record,
      {
        revokedAt:
          at,
        reason
      }
    );
  const next =
    createAuthorizedEcmrSignerKey({
      signerKeyId,
      organizationId:
        record.organizationId,
      label,
      publicKey,
      signer:
        record.signer,
      custody,
      validFrom:
        at,
      validUntil,
      createdAt:
        at,
      replacesSignerKeyId:
        record.signerKeyId
    });

  if (
    next.publicKeyFingerprint ===
      record.publicKeyFingerprint
  ) {
    throw fail(
      "ECMR_SIGNER_ROTATION_KEY_UNCHANGED",
      "Key rotation requires a different public verification key"
    );
  }

  return {
    previous,
    next
  };
}

const sameSigner = (
  left,
  right
) =>
  left.signerId ===
    right.signerId &&
  left.partyRole ===
    right.partyRole &&
  left.identityScheme ===
    right.identityScheme &&
  (
    left.identityAssurance ??
      null
  ) ===
    (
      right.identityAssurance ??
        null
    );

export function evaluateAuthorizedEcmrSignature({
  signerKey,
  evidence,
  verification
}) {
  if (
    verification?.valid !==
      true ||
    evidence === null ||
    typeof evidence !==
      "object"
  ) {
    return {
      authorized:
        false,
      code:
        "ECMR_SIGNER_VERIFICATION_REQUIRED"
    };
  }

  if (
    signerKey
      .policyVersion !==
      ECMR_SIGNER_POLICY_VERSION
  ) {
    return {
      authorized:
        false,
      code:
        "ECMR_SIGNER_POLICY_VERSION_MISMATCH"
    };
  }

  if (
    evidence
      .publicKeyFingerprint !==
        signerKey
          .publicKeyFingerprint ||
    verification
      .publicKeyFingerprint !==
        signerKey
          .publicKeyFingerprint
  ) {
    return {
      authorized:
        false,
      code:
        "ECMR_SIGNER_KEY_NOT_AUTHORIZED"
    };
  }

  if (
    !sameSigner(
      evidence.signer,
      signerKey.signer
    ) ||
    !sameSigner(
      verification.signer,
      signerKey.signer
    )
  ) {
    return {
      authorized:
        false,
      code:
        "ECMR_SIGNER_IDENTITY_NOT_AUTHORIZED"
    };
  }

  const signedAt =
    new Date(
      evidence.signedAt
    );
  const validFrom =
    new Date(
      signerKey.validFrom
    );
  const validUntil =
    signerKey.validUntil
      ? new Date(
          signerKey.validUntil
        )
      : null;
  const revokedAt =
    signerKey.revokedAt
      ? new Date(
          signerKey.revokedAt
        )
      : null;

  if (
    Number.isNaN(
      signedAt.getTime()
    ) ||
    signedAt <
      validFrom ||
    (
      validUntil &&
      signedAt >=
        validUntil
    ) ||
    (
      revokedAt &&
      signedAt >=
        revokedAt
    )
  ) {
    return {
      authorized:
        false,
      code:
        "ECMR_SIGNER_KEY_NOT_VALID_AT_SIGNING_TIME"
    };
  }

  return {
    authorized: true,
    code: null,
    policyVersion:
      ECMR_SIGNER_POLICY_VERSION,
    signerKeyId:
      signerKey
        .signerKeyId,
    organizationId:
      signerKey
        .organizationId,
    publicKeyFingerprint:
      signerKey
        .publicKeyFingerprint,
    signer:
      structuredClone(
        signerKey.signer
      ),
    custody: {
      ...structuredClone(
        signerKey.custody
      ),
      privateKeyStored:
        false
    },
    signedAt:
      evidence.signedAt,
    jurisdictionAcceptance:
      "pending"
  };
}
