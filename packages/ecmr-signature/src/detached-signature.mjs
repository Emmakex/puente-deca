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
  "detached-ed25519-exact-xml-v1";

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
) =>
  Buffer.from(
    requireText(
      xml,
      "xml"
    ),
    "utf8"
  );

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
  try {
    return createPublicKey(
      key
    );
  } catch {
    throw fail(
      "ECMR_SIGNATURE_PUBLIC_KEY_INVALID",
      "A valid public verification key is required"
    );
  }
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
      "signedAt must be an exact ISO-8601 UTC instant"
    );
  }

  return value;
};

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

  let signatureBytes;
  let verificationKey;

  try {
    verificationKey =
      createPublicKey(
        privateKey
      );
    signatureBytes =
      sign(
        null,
        bytes,
        privateKey
      );
  } catch {
    throw fail(
      "ECMR_SIGNATURE_SIGNING_FAILED",
      "The supplied key cannot create an Ed25519 signature"
    );
  }

  const signatureValue =
    signatureBytes
      .toString(
        "base64url"
      );
  const signatureId =
    `sig_${createHash(
      "sha256"
    )
      .update(
        signatureBytes
      )
      .digest("hex")
      .slice(0, 32)}`;

  return {
    formatVersion:
      ECMR_SIGNATURE_FORMAT_VERSION,
    algorithm:
      ECMR_SIGNATURE_ALGORITHM,
    method:
      ECMR_SIGNATURE_METHOD,
    signatureId,
    signer: identity,
    signedAt:
      instant,
    contentHash:
      sha256(bytes),
    publicKeyFingerprint:
      publicKeyFingerprint(
        verificationKey
      ),
    signatureValue
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

  try {
    normalizeSigner(
      evidence.signer
    );
    normalizeSignedAt(
      evidence.signedAt
    );
    requireText(
      evidence.signatureId,
      "evidence.signatureId"
    );
    requireText(
      evidence.signatureValue,
      "evidence.signatureValue"
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

  let signature;

  try {
    signature =
      Buffer.from(
        evidence.signatureValue,
        "base64url"
      );
  } catch {
    return evidenceFailure(
      "ECMR_SIGNATURE_VALUE_INVALID",
      "Signature value is not valid base64url"
    );
  }

  let valid = false;

  try {
    valid =
      verify(
        null,
        bytes,
        key,
        signature
      );
  } catch {
    valid = false;
  }

  if (!valid) {
    return evidenceFailure(
      "ECMR_SIGNATURE_CRYPTOGRAPHIC_VERIFICATION_FAILED",
      "The detached eCMR signature is not valid for the supplied content and key"
    );
  }

  return {
    valid: true,
    code: null,
    signatureId:
      evidence.signatureId,
    signer:
      structuredClone(
        evidence.signer
      ),
    signedAt:
      evidence.signedAt,
    contentHash,
    publicKeyFingerprint:
      fingerprint
  };
}
