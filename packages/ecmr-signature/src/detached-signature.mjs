import {
  createHash,
  createPublicKey,
  sign,
  verify
} from "node:crypto";

export const ECMR_SIGNATURE_FORMAT_VERSION =
  "ecmr-detached-signature-v1";
export const ECMR_SIGNATURE_ALGORITHM =
  "Ed25519";
export const ECMR_SIGNATURE_METHOD =
  "detached-ed25519-bound-statement-v1";
export const ECMR_SIGNATURE_DOMAIN =
  "PUENTE-DECA-ECMR-SIGNATURE-V1";

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
      "ECMR_SIGNATURE_INPUT_INVALID",
      `${name} is required`
    );
  }

  return value.trim();
};

const xmlBytes = (
  xml
) => {
  if (
    typeof xml !== "string" ||
    xml.trim().length === 0
  ) {
    throw fail(
      "ECMR_SIGNATURE_INPUT_INVALID",
      "xml is required"
    );
  }

  return Buffer.from(
    xml,
    "utf8"
  );
};

const sha256 = (
  value
) =>
  `sha256:${createHash(
    "sha256"
  )
    .update(value)
    .digest("hex")}`;

const publicKeyObject = (
  key
) => {
  let object;

  try {
    object =
      key &&
      typeof key ===
        "object" &&
      key.type ===
        "public" &&
      typeof key.export ===
        "function"
        ? key
        : createPublicKey(
            key
          );
  } catch {
    throw fail(
      "ECMR_SIGNATURE_PUBLIC_KEY_INVALID",
      "A valid public verification key is required"
    );
  }

  if (
    object.type !== "public" ||
    object.asymmetricKeyType !==
    "ed25519"
  ) {
    throw fail(
      "ECMR_SIGNATURE_KEY_TYPE_INVALID",
      "The eCMR detached-signature profile requires an Ed25519 key"
    );
  }

  return object;
};

const publicKeyFingerprint = (
  key
) => {
  const object =
    publicKeyObject(key);
  const der =
    object.export({
      type: "spki",
      format: "der"
    });

  return sha256(der);
};

const normalizeSigner = (
  signer
) => {
  if (
    signer === null ||
    typeof signer !==
      "object" ||
    Array.isArray(signer)
  ) {
    throw fail(
      "ECMR_SIGNATURE_SIGNER_INVALID",
      "Signer metadata must be an object"
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
      typeof signer
        .identityAssurance ===
        "string" &&
      signer
        .identityAssurance
        .trim()
        .length > 0
        ? signer
            .identityAssurance
            .trim()
        : null
  };
};

const normalizeSignedAt = (
  signedAt
) => {
  const value =
    requireText(
      signedAt,
      "signedAt"
    );
  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime()
    ) ||
    parsed.toISOString() !==
      value
  ) {
    throw fail(
      "ECMR_SIGNATURE_SIGNED_AT_INVALID",
      "signedAt must be an exact ISO-8601 UTC instant with milliseconds"
    );
  }

  return value;
};

const signingStatement = ({
  contentHash,
  publicKeyFingerprint:
    fingerprint,
  signer,
  signedAt
}) => {
  const payload = {
    formatVersion:
      ECMR_SIGNATURE_FORMAT_VERSION,
    algorithm:
      ECMR_SIGNATURE_ALGORITHM,
    method:
      ECMR_SIGNATURE_METHOD,
    contentHash,
    publicKeyFingerprint:
      fingerprint,
    signer,
    signedAt
  };

  return Buffer.from(
    `${ECMR_SIGNATURE_DOMAIN}\n${JSON.stringify(
      payload
    )}`,
    "utf8"
  );
};

const signatureId = (
  signature
) =>
  `sig_${createHash(
    "sha256"
  )
    .update(signature)
    .digest("hex")
    .slice(0, 32)}`;

export function createEcmrDetachedSignature({
  xml,
  privateKey,
  signer,
  signedAt
}) {
  if (!privateKey) {
    throw fail(
      "ECMR_SIGNATURE_PRIVATE_KEY_REQUIRED",
      "A private signing key is required"
    );
  }

  const bytes =
    xmlBytes(xml);
  const identity =
    normalizeSigner(signer);
  const instant =
    normalizeSignedAt(
      signedAt
    );

  let verificationKey;

  try {
    verificationKey =
      createPublicKey(
        privateKey
      );
  } catch {
    throw fail(
      "ECMR_SIGNATURE_SIGNING_KEY_INVALID",
      "The supplied private key cannot produce a verification key"
    );
  }

  if (
    verificationKey
      .asymmetricKeyType !==
    "ed25519"
  ) {
    throw fail(
      "ECMR_SIGNATURE_KEY_TYPE_INVALID",
      "The eCMR detached-signature profile requires an Ed25519 key"
    );
  }

  const contentHash =
    sha256(bytes);
  const fingerprint =
    publicKeyFingerprint(
      verificationKey
    );
  const statement =
    signingStatement({
      contentHash,
      publicKeyFingerprint:
        fingerprint,
      signer: identity,
      signedAt:
        instant
    });

  let signatureBytes;

  try {
    signatureBytes =
      sign(
        null,
        statement,
        privateKey
      );
  } catch {
    throw fail(
      "ECMR_SIGNATURE_SIGNING_FAILED",
      "The supplied key cannot create an Ed25519 signature"
    );
  }

  return {
    formatVersion:
      ECMR_SIGNATURE_FORMAT_VERSION,
    algorithm:
      ECMR_SIGNATURE_ALGORITHM,
    method:
      ECMR_SIGNATURE_METHOD,
    signatureId:
      signatureId(
        signatureBytes
      ),
    signer: identity,
    signedAt:
      instant,
    contentHash,
    publicKeyFingerprint:
      fingerprint,
    signatureValue:
      signatureBytes
        .toString(
          "base64url"
        )
  };
}

const evidenceFailure = (
  code,
  message
) => ({
  valid: false,
  code,
  message
});

const decodeSignature = (
  value
) => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(
      value
    )
  ) {
    return null;
  }

  const decoded =
    Buffer.from(
      value,
      "base64url"
    );

  return decoded.length === 64
    ? decoded
    : null;
};

export function verifyEcmrDetachedSignature({
  xml,
  evidence,
  publicKey
}) {
  let bytes;
  let key;

  try {
    bytes =
      xmlBytes(xml);
    key =
      publicKeyObject(
        publicKey
      );
  } catch (error) {
    return evidenceFailure(
      error?.code ??
        "ECMR_SIGNATURE_VERIFICATION_INPUT_INVALID",
      error?.message ??
        "Signature verification input is invalid"
    );
  }

  if (
    evidence === null ||
    typeof evidence !==
      "object" ||
    Array.isArray(evidence)
  ) {
    return evidenceFailure(
      "ECMR_SIGNATURE_EVIDENCE_INVALID",
      "Signature evidence must be an object"
    );
  }

  if (
    evidence.formatVersion !==
      ECMR_SIGNATURE_FORMAT_VERSION ||
    evidence.algorithm !==
      ECMR_SIGNATURE_ALGORITHM ||
    evidence.method !==
      ECMR_SIGNATURE_METHOD
  ) {
    return evidenceFailure(
      "ECMR_SIGNATURE_PROFILE_MISMATCH",
      "Signature evidence does not match the supported eCMR signature profile"
    );
  }

  let signer;
  let signedAt;

  try {
    signer =
      normalizeSigner(
        evidence.signer
      );
    signedAt =
      normalizeSignedAt(
        evidence.signedAt
      );
    requireText(
      evidence.signatureId,
      "evidence.signatureId"
    );
    requireText(
      evidence.contentHash,
      "evidence.contentHash"
    );
    requireText(
      evidence
        .publicKeyFingerprint,
      "evidence.publicKeyFingerprint"
    );
  } catch (error) {
    return evidenceFailure(
      error?.code ??
        "ECMR_SIGNATURE_EVIDENCE_INVALID",
      error?.message ??
        "Signature evidence is invalid"
    );
  }

  const contentHash =
    sha256(bytes);

  if (
    evidence.contentHash !==
    contentHash
  ) {
    return evidenceFailure(
      "ECMR_SIGNATURE_CONTENT_HASH_MISMATCH",
      "The signed eCMR content hash does not match the evidence"
    );
  }

  const fingerprint =
    publicKeyFingerprint(
      key
    );

  if (
    evidence
      .publicKeyFingerprint !==
    fingerprint
  ) {
    return evidenceFailure(
      "ECMR_SIGNATURE_KEY_FINGERPRINT_MISMATCH",
      "The verification key does not match the signed evidence"
    );
  }

  const signature =
    decodeSignature(
      evidence.signatureValue
    );

  if (!signature) {
    return evidenceFailure(
      "ECMR_SIGNATURE_VALUE_INVALID",
      "Signature value must be a 64-byte Ed25519 signature encoded as base64url"
    );
  }

  if (
    evidence.signatureId !==
    signatureId(signature)
  ) {
    return evidenceFailure(
      "ECMR_SIGNATURE_ID_MISMATCH",
      "Signature ID does not match the detached signature value"
    );
  }

  const statement =
    signingStatement({
      contentHash,
      publicKeyFingerprint:
        fingerprint,
      signer,
      signedAt
    });

  let valid = false;

  try {
    valid =
      verify(
        null,
        statement,
        key,
        signature
      );
  } catch {
    valid = false;
  }

  if (!valid) {
    return evidenceFailure(
      "ECMR_SIGNATURE_CRYPTOGRAPHIC_VERIFICATION_FAILED",
      "The detached eCMR signature is not valid for the supplied content, identity statement and key"
    );
  }

  return {
    valid: true,
    code: null,
    formatVersion:
      evidence.formatVersion,
    algorithm:
      evidence.algorithm,
    method:
      evidence.method,
    signatureId:
      evidence.signatureId,
    signer,
    signedAt,
    contentHash,
    publicKeyFingerprint:
      fingerprint
  };
}
