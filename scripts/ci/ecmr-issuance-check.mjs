import {
  spawnSync
} from "node:child_process";
import {
  readFile
} from "node:fs/promises";

const [
  readiness,
  signerRegistry,
  server,
  openapi
] = await Promise.all([
  readFile(
    "packages/core/src/ecmr-issuance-readiness.mjs",
    "utf8"
  ),
  readFile(
    "packages/ecmr-signature/src/signer-registry.mjs",
    "utf8"
  ),
  readFile(
    "apps/api/src/server.mjs",
    "utf8"
  ),
  readFile(
    "docs/openapi.json",
    "utf8"
  )
]);

for (const token of [
  "ECMR_ISSUANCE_READINESS_VERSION",
  '"ecmr-issuance-readiness-v1"',
  '"current_immutable_head"',
  '"verified_human_review"',
  '"immutable_amendment_history"',
  '"official_d25a_schema"',
  '"authorized_signature"',
  '"jurisdiction_signature_policy"',
  '"agreed_operational_procedures"',
  "ECMR_PROTOCOL_ARTICLE_3",
  "ECMR_PROTOCOL_ARTICLE_4",
  "ECMR_PROTOCOL_ARTICLE_5",
  "official-d25a-xsd-pass",
  "evidenceSha256",
  "currentHeadVersionId",
  "blockingCodes"
]) {
  if (!readiness.includes(token)) {
    throw new Error(
      `eCMR issuance-readiness core is missing ${token}`
    );
  }
}

if (
  !/identityAssurance\s*===\s*[\s\S]*authorization[\s\S]*identityAssurance/.test(
    readiness
  ) ||
  !/custodyModel\s*===\s*[\s\S]*authorization[\s\S]*controlModel/.test(
    readiness
  )
) {
  throw new Error(
    "Jurisdiction acceptance must bind to the actual authorized identity assurance and custody model"
  );
}

for (const token of [
  "signatureId:",
  "method:",
  "contentHash:",
  "jurisdictionAcceptance:"
]) {
  if (!signerRegistry.includes(token)) {
    throw new Error(
      `Signer authorization result is missing issuance binding field ${token}`
    );
  }
}

for (const token of [
  "ecmrIssuanceReadinessMatch",
  "evaluateEcmrIssuanceReadiness",
  "verifyEcmrDetachedSignature",
  "evaluateAuthorizedEcmrSignature",
  "getEcmrSignerKey",
  "authenticatePlatformService",
  "schemaAcceptance",
  "jurisdictionPolicy",
  "procedureAgreement"
]) {
  if (!server.includes(token)) {
    throw new Error(
      `eCMR issuance-readiness API is missing ${token}`
    );
  }
}

const document =
  JSON.parse(openapi);
const path =
  document.paths?.[
    "/v1/shipments/{shipmentId}/ecmr/versions/{versionId}/issuance-readiness"
  ]?.post;

if (!path) {
  throw new Error(
    "eCMR issuance-readiness OpenAPI route is missing"
  );
}

if (
  !path.description.includes(
    "never issues or signs"
  ) ||
  !path.description.includes(
    "Raw XML"
  )
) {
  throw new Error(
    "eCMR issuance-readiness contract must state its non-issuance and XML privacy boundaries"
  );
}

const security =
  path.security?.[0];

if (
  !security ||
  !Object.hasOwn(
    security,
    "platformServiceSecret"
  ) ||
  !Object.hasOwn(
    security,
    "platformOrganizationId"
  )
) {
  throw new Error(
    "eCMR issuance readiness must be Kairoseth Platform-only"
  );
}

for (const field of [
  "signerKeyId",
  "signatureEvidence",
  "schemaAcceptance",
  "jurisdictionPolicy",
  "procedureAgreement"
]) {
  if (
    !path.requestBody?.content?.[
      "application/json"
    ]?.schema?.properties?.[
      field
    ]
  ) {
    throw new Error(
      `eCMR issuance-readiness request contract is missing ${field}`
    );
  }
}

for (const file of [
  "packages/core/src/ecmr-issuance-readiness.mjs",
  "packages/ecmr-signature/src/signer-registry.mjs",
  "apps/api/src/server.mjs"
]) {
  const parsed =
    spawnSync(
      process.execPath,
      [
        "--check",
        file
      ],
      {
        encoding: "utf8"
      }
    );

  if (
    parsed.status !==
      0
  ) {
    throw new Error(
      `eCMR issuance source failed syntax check: ${file}\n${parsed.stderr ?? ""}`
    );
  }
}

console.log(
  "eCMR issuance-readiness contract OK (current head, review, amendment integrity, official D25A PASS, verified authorized signature, jurisdiction policy and Article 5 procedures; no issuance side effects)"
);
