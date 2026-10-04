import {
  readFile
} from "node:fs/promises";

const [
  draft,
  server,
  openapi,
  review
] = await Promise.all([
  readFile(
    "packages/core/src/ecmr-draft.mjs",
    "utf8"
  ),
  readFile(
    "apps/api/src/server.mjs",
    "utf8"
  ),
  readFile(
    "docs/openapi.json",
    "utf8"
  ),
  readFile(
    "packages/ecmr-xml/src/review-snapshot.mjs",
    "utf8"
  )
]);

for (const token of [
  '"sender"',
  '"contractual_carrier"',
  '"consignee"',
  "prepareEcmrDraft",
  "validateEcmrProjection",
  "ECMR_UNCEFACT_RELEASE"
]) {
  if (!draft.includes(token)) {
    throw new Error(
      `Structured eCMR draft core is missing ${token}`
    );
  }
}

if (
  /contractual_shipper[\s\S]{0,180}(sender|contractual_carrier)|effective_carrier[\s\S]{0,180}contractual_carrier/.test(
    draft
  )
) {
  throw new Error(
    "Structured eCMR draft must not infer CMR legal parties from DeCA roles"
  );
}

for (const token of [
  "ecmrPreviewMatch",
  "ecmrStructuredVersionsMatch",
  "prepareStructuredEcmr",
  "structuredEcmrPreviewResponse",
  "regulatoryVersionWithoutXml",
  '"regulatory:write"',
  "expectedPreviousVersionId"
]) {
  if (!server.includes(token)) {
    throw new Error(
      `Structured eCMR API is missing ${token}`
    );
  }
}

if (
  !/const regulatoryVersionWithoutXml[\s\S]*xml:\s*_xml[\s\S]*\.\.\.safe/.test(
    server
  )
) {
  throw new Error(
    "Structured eCMR append must strip stored XML from its response"
  );
}

if (
  !/const structuredEcmrPreviewResponse[\s\S]*projection:[\s\S]*validation:[\s\S]*wire:/.test(
    server
  )
) {
  throw new Error(
    "Structured eCMR preview must expose structured projection, validation and wire metadata"
  );
}

for (const token of [
  "createEcmrReviewSnapshot",
  "verifyEcmrReviewSnapshot",
  "canonicalJson",
  "ECMR_REVIEW_HASH_MISMATCH",
  "ECMR_REVIEW_CONTENT_HASH_MISMATCH"
]) {
  if (!review.includes(token)) {
    throw new Error(
      `eCMR human-review integrity boundary is missing ${token}`
    );
  }
}

for (const token of [
  "record.reviewSnapshot",
  "record.reviewHash",
  "verifyEcmrReviewSnapshot",
  "ecmr_review_integrity_failure"
]) {
  if (!server.includes(token)) {
    throw new Error(
      `Structured eCMR history is missing review-snapshot enforcement: ${token}`
    );
  }
}

const document =
  JSON.parse(openapi);

for (const path of [
  "/v1/shipments/{shipmentId}/ecmr/preview",
  "/v1/shipments/{shipmentId}/ecmr/versions/structured"
]) {
  if (!document.paths?.[path]?.post) {
    throw new Error(
      `Structured eCMR OpenAPI path missing: ${path}`
    );
  }
}

const preview =
  document.paths[
    "/v1/shipments/{shipmentId}/ecmr/preview"
  ].post;
const structuredAppend =
  document.paths[
    "/v1/shipments/{shipmentId}/ecmr/versions/structured"
  ].post;

if (
  !preview.description.includes(
    "not returned"
  ) ||
  !structuredAppend.description.includes(
    "not returned"
  )
) {
  throw new Error(
    "Structured eCMR OpenAPI must state that raw XML is not returned"
  );
}

const appendSchema =
  structuredAppend
    .requestBody?.content?.[
      "application/json"
    ]?.schema;

if (
  !appendSchema?.required?.includes(
    "draft"
  ) ||
  !appendSchema?.required?.includes(
    "expectedPreviousVersionId"
  )
) {
  throw new Error(
    "Structured eCMR append must require draft plus explicit expected head"
  );
}

console.log(
  "Structured eCMR flow contract OK (explicit legal facts, no DeCA role inference, server-side D25A generation, XML-free responses, verifiable human-review snapshots)"
);
