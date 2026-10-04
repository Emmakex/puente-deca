import {
  readFile
} from "node:fs/promises";

const [
  signature,
  bridge,
  validator
] = await Promise.all([
  readFile(
    "packages/ecmr-signature/src/detached-signature.mjs",
    "utf8"
  ),
  readFile(
    "packages/core/src/ecmr-signature-evidence.mjs",
    "utf8"
  ),
  readFile(
    "packages/core/src/validate-ecmr.mjs",
    "utf8"
  )
]);

for (const token of [
  'from "node:crypto"',
  '"ed25519"',
  'ECMR_SIGNATURE_ALGORITHM =\n  "Ed25519"',
  '"PUENTE-DECA-ECMR-SIGNATURE-V1"',
  "contentHash",
  "publicKeyFingerprint",
  "signerId",
  "partyRole",
  "identityScheme",
  "signingStatement",
  "signatureValue",
  "verify("
]) {
  if (!signature.includes(token)) {
    throw new Error(
      `eCMR signature core is missing ${token}`
    );
  }
}

if (
  !/signingStatement\(\{[\s\S]*contentHash[\s\S]*publicKeyFingerprint[\s\S]*signer[\s\S]*signedAt/.test(
    signature
  )
) {
  throw new Error(
    "eCMR signature must bind exact-content hash, verification key, signer metadata and signing time"
  );
}

if (
  /console\.(?:log|error|warn)|process\.(?:stdout|stderr)/.test(
    signature
  )
) {
  throw new Error(
    "eCMR signature core must not log key or signature material"
  );
}

if (
  /privateKey\s*[:,]\s*(?:evidence|signature|return)|PRIVATE KEY/.test(
    signature
  )
) {
  throw new Error(
    "eCMR detached evidence must never serialize private-key material"
  );
}

for (const token of [
  "verification.valid",
  "ECMR_SIGNATURE_VERIFICATION_REQUIRED",
  "ECMR_SIGNATURE_VERIFICATION_MISMATCH",
  '"cryptographically-verified"',
  "amendmentHistoryPreserved"
]) {
  if (!bridge.includes(token)) {
    throw new Error(
      `eCMR signature bridge is missing ${token}`
    );
  }
}

if (
  /state:\s*"authenticated"/.test(
    bridge
  )
) {
  throw new Error(
    "Raw cryptographic verification must not be promoted to legal/authentication-policy acceptance"
  );
}

if (
  !validator.includes(
    "ECMR_PROTOCOL_ARTICLE_3"
  ) ||
  !validator.includes(
    "ECMR_PROTOCOL_ARTICLE_4"
  )
) {
  throw new Error(
    "Electronic readiness must retain separate Protocol Article 3 and Article 4 gates"
  );
}

console.log(
  "eCMR detached-signature contract OK (Ed25519 identity-bound evidence, exact-content hash, verified-only projection binding, legal-authentication and amendment gates remain fail-closed)"
);
