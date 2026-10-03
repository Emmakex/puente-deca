import { readFile } from "node:fs/promises";

const document = JSON.parse(
  await readFile("docs/openapi.json", "utf8")
);

if (document.openapi !== "3.1.0") {
  throw new Error("OpenAPI 3.1.0 is required");
}

const requiredPaths = [
  "/health",
  "/v1/deca/validate",
  "/v1/deca/pdf",
  "/v1/shipments",
  "/v1/shipments/{shipmentId}",
  "/v1/shipments/{shipmentId}/deca",
  "/v1/deca/{documentId}",
  "/v1/credentials",
  "/v1/usage/documents",
  "/v1/access/connectors",
  "/d/{token}.pdf"
];

for (const path of requiredPaths) {
  if (!document.paths?.[path]) {
    throw new Error(
      `OpenAPI path missing: ${path}`
    );
  }
}

const publicDownload =
  document.paths["/d/{token}.pdf"]?.get;

if (publicDownload?.security) {
  throw new Error(
    "QR PDF endpoint must not require API authentication"
  );
}

const credentialCollection =
  document.paths["/v1/credentials"];

if (!credentialCollection?.patch) {
  throw new Error(
    "Credential expiry synchronization route is missing"
  );
}

const credentialExpiry =
  credentialCollection?.post?.requestBody?.content?.[
    "application/json"
  ]?.schema?.properties?.expiresAt;

if (
  !credentialExpiry ||
  credentialExpiry.format !== "date-time"
) {
  throw new Error(
    "Credential create contract must expose expiresAt"
  );
}

if (
  !document.components?.securitySchemes?.bearerAuth
) {
  throw new Error(
    "Bearer API-key security scheme is missing"
  );
}

console.log(
  `OpenAPI contract OK (${requiredPaths.length} required paths)`
);
