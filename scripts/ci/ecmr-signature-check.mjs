import {
  spawnSync
} from "node:child_process";
import {
  readFile
} from "node:fs/promises";

const [
  signature,
  signerRegistry,
  bridge,
  validator,
  server,
  jsonStore,
  mongoStore,
  openapi
] = await Promise.all([
  readFile(
    "packages/ecmr-signature/src/detached-signature.mjs",
    "utf8"
  ),
  readFile(
    "packages/ecmr-signature/src/signer-registry.mjs",
    "utf8"
  ),
  readFile(
    "packages/core/src/ecmr-signature-evidence.mjs",
    "utf8"
  ),
  readFile(
    "packages/core/src/validate-ecmr.mjs",
    "utf8"
  ),
  readFile(
    "apps/api/src/server.mjs",
    "utf8"
  ),
  readFile(
    "packages/persistence/src/json-store.mjs",
    "utf8"
  ),
  readFile(
    "packages/persistence/src/mongo-store.mjs",
    "utf8"
  ),
  readFile(
    "docs/openapi.json",
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
  "ECMR_SIGNER_POLICY_VERSION",
  '"ecmr-signer-authorization-v1"',
  '"external"',
  "privateKeyStored",
  "createAuthorizedEcmrSignerKey",
  "publicEcmrSignerKey",
  "revokeAuthorizedEcmrSignerKey",
  "rotateAuthorizedEcmrSignerKey",
  "evaluateAuthorizedEcmrSignature",
  "ECMR_SIGNER_CUSTODY_MODE_INVALID",
  "ECMR_SIGNER_KEY_NOT_VALID_AT_SIGNING_TIME",
  "jurisdictionAcceptance"
]) {
  if (!signerRegistry.includes(token)) {
    throw new Error(
      `eCMR signer authorization core is missing ${token}`
    );
  }
}

if (
  !/custody\.mode\s*!==\s*[\s\n]*"external"/.test(
    signerRegistry
  ) ||
  !/privateKeyStored:\s*[\s\n]*false/.test(
    signerRegistry
  )
) {
  throw new Error(
    "eCMR signer policy must require external custody and explicitly record that no private key is stored"
  );
}

if (
  /createPrivateKey|generateKeyPair|generateKeyPairSync/.test(
    signerRegistry
  )
) {
  throw new Error(
    "eCMR signer registry must not create or import private-key custody"
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

for (const source of [
  jsonStore,
  mongoStore
]) {
  for (const token of [
    "registerEcmrSignerKey",
    "listEcmrSignerKeys",
    "getEcmrSignerKey",
    "revokeEcmrSignerKey",
    "rotateEcmrSignerKey",
    "publicEcmrSignerKey",
    "ecmr.signer_key.registered",
    "ecmr.signer_key.revoked",
    "ecmr.signer_key.rotated"
  ]) {
    if (!source.includes(token)) {
      throw new Error(
        `eCMR signer persistence is missing ${token}`
      );
    }
  }
}

for (const token of [
  '"/v1/ecmr/signer-keys"',
  "signerKeyRevokeMatch",
  "signerKeyRotateMatch",
  "authenticatePlatformService",
  "registerEcmrSignerKey",
  "revokeEcmrSignerKey",
  "rotateEcmrSignerKey"
]) {
  if (!server.includes(token)) {
    throw new Error(
      `Kairoseth signer administration API is missing ${token}`
    );
  }
}

const document =
  JSON.parse(
    openapi
  );

for (const path of [
  "/v1/ecmr/signer-keys",
  "/v1/ecmr/signer-keys/{signerKeyId}/revoke",
  "/v1/ecmr/signer-keys/{signerKeyId}/rotate"
]) {
  if (
    !document.paths?.[path]
  ) {
    throw new Error(
      `eCMR signer OpenAPI path missing: ${path}`
    );
  }
}

if (
  !document.paths[
    "/v1/ecmr/signer-keys"
  ].post.description.includes(
    "never accepts or stores the private key"
  )
) {
  throw new Error(
    "eCMR signer OpenAPI must preserve the external private-key custody boundary"
  );
}

for (const path of [
  "packages/ecmr-signature/src/signer-registry.mjs",
  "packages/persistence/src/json-store.mjs",
  "packages/persistence/src/mongo-store.mjs",
  "apps/api/src/server.mjs"
]) {
  const parsed =
    spawnSync(
      process.execPath,
      [
        "--check",
        path
      ],
      {
        encoding:
          "utf8"
      }
    );

  if (
    parsed.status !==
      0
  ) {
    throw new Error(
      `eCMR signer source failed syntax check: ${path}\n${parsed.stderr ?? ""}`
    );
  }
}

console.log(
  "eCMR signature contract OK (Ed25519 exact-content evidence, tenant-scoped authorized public-key registry, external custody only, rotation/revocation, Kairoseth-only administration, jurisdiction acceptance remains separate)"
);
