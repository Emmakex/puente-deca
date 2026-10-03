import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { normalizeDecaRequest } from "../../../packages/core/src/normalize-deca.mjs";
import { validateDecaRequest } from "../../../packages/core/src/validate-deca.mjs";
import {
  createDocumentSnapshot,
  reviseDocumentSnapshot
} from "../../../packages/document-engine/src/snapshot.mjs";
import { renderNativeDecaPdf } from "../../../packages/document-engine/src/pdf.mjs";
import {
  createRuntimeMetrics
} from "./metrics.mjs";

const sendText = (
  response,
  status,
  body,
  contentType = "text/plain; version=0.0.4; charset=utf-8"
) => {
  response.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
};

const sendJson = (response, status, body) => {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data)
  });
  response.end(data);
};

const sendPdf = (
  response,
  snapshot,
  pdf,
  { status = 200 } = {}
) => {
  response.writeHead(status, {
    "content-type": "application/pdf",
    "content-length": pdf.length,
    "content-disposition":
      `attachment; filename="${snapshot.documentId}.pdf"`,
    "cache-control": "private, no-store",
    "x-deca-document-id": snapshot.documentId,
    "x-deca-version": String(snapshot.version)
  });
  response.end(pdf);
};

const readJson = async (request, limit = 1024 * 1024) => {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Payload too large");
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const createSnapshot = (payload, publicBaseUrl) =>
  createDocumentSnapshot(payload, {
    baseUrl: publicBaseUrl
  });

const pdfErrorResponse = (response, error) => {
  if (error?.code === "DECA_VALIDATION_FAILED") {
    sendJson(response, 422, error.validation);
    return true;
  }

  if (error?.code === "DECA_PDF_UNSUPPORTED_CHARACTER") {
    sendJson(response, 422, {
      error: "unsupported_pdf_character",
      message:
        "The current PDF font cannot represent all supplied characters",
      character: error.character,
      codePoint: error.codePoint
    });
    return true;
  }

  if (error?.code === "DECA_QR_CAPACITY_EXCEEDED") {
    sendJson(response, 422, {
      error: "qr_capacity_exceeded",
      message:
        "The configured public document URL is too long for the current QR profile",
      bytes: error.bytes,
      maxBytes: error.maxBytes
    });
    return true;
  }

  return false;
};

const requireStore = (response, store) => {
  if (store) return true;

  sendJson(response, 503, {
    error: "operational_store_unavailable",
    message: "Operational persistence is not configured"
  });
  return false;
};

const requireOperationalStores = (
  response,
  store,
  artifactStore
) => {
  if (store && artifactStore) return true;

  sendJson(response, 503, {
    error: "operational_store_unavailable",
    message: "Operational persistence is not configured"
  });
  return false;
};

const secureSecretEqual = (candidate, configured) => {
  if (
    typeof candidate !== "string" ||
    typeof configured !== "string" ||
    configured.length < 32
  ) {
    return false;
  }

  const candidateHash = createHash("sha256")
    .update(candidate)
    .digest();
  const configuredHash = createHash("sha256")
    .update(configured)
    .digest();

  return timingSafeEqual(candidateHash, configuredHash);
};

const authenticatePlatformService = async (
  request,
  response,
  store,
  platformServiceSecret
) => {
  const serviceSecret =
    request.headers["x-kairoseth-service-secret"];
  const serviceOrganizationId =
    request.headers["x-kairoseth-organization-id"];

  if (
    typeof serviceSecret !== "string" ||
    typeof serviceOrganizationId !== "string" ||
    !secureSecretEqual(
      serviceSecret,
      platformServiceSecret
    )
  ) {
    sendJson(response, 401, {
      error: "unauthorized",
      message:
        "Kairoseth service authentication is required"
    });
    return null;
  }

  const organizationId =
    serviceOrganizationId.trim();

  if (!organizationId) {
    sendJson(response, 401, {
      error: "unauthorized",
      message:
        "Kairoseth organization context is required"
    });
    return null;
  }

  await store.ensureOrganization({
    organizationId,
    name: `Kairoseth organization ${organizationId}`,
    externalReference: organizationId
  });

  return {
    credentialId: "kairoseth-platform",
    organizationId,
    scopes: [
      "shipments:read",
      "shipments:write",
      "documents:read",
      "documents:write"
    ],
    source: "kairoseth-platform"
  };
};

const authenticate = async (
  request,
  response,
  store,
  requiredScope,
  platformServiceSecret = null
) => {
  const serviceSecret =
    request.headers["x-kairoseth-service-secret"];
  const serviceOrganizationId =
    request.headers["x-kairoseth-organization-id"];

  if (serviceSecret || serviceOrganizationId) {
    return authenticatePlatformService(
      request,
      response,
      store,
      platformServiceSecret
    );
  }

  const header = request.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);

  if (!match) {
    sendJson(response, 401, {
      error: "unauthorized",
      message:
        "Bearer API key or Kairoseth service authentication is required"
    });
    return null;
  }

  const credential = await store.authenticateApiKey(
    match[1].trim()
  );

  if (!credential) {
    sendJson(response, 401, {
      error: "unauthorized",
      message: "API key is invalid or revoked"
    });
    return null;
  }

  if (
    requiredScope &&
    !credential.scopes.includes(requiredScope)
  ) {
    sendJson(response, 403, {
      error: "forbidden",
      message: `API key requires scope ${requiredScope}`
    });
    return null;
  }

  return credential;
};

const CONNECTOR_SCOPES = [
  "shipments:read",
  "shipments:write",
  "documents:read",
  "documents:write"
];

const normalizeConnectorScopes = (value) => {
  if (value === undefined) {
    return [...CONNECTOR_SCOPES];
  }

  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const scopes = [
    ...new Set(
      value.filter(
        (scope) =>
          typeof scope === "string" &&
          CONNECTOR_SCOPES.includes(scope)
      )
    )
  ];

  if (
    scopes.length !== value.length ||
    scopes.length === 0
  ) {
    return null;
  }

  return scopes.sort();
};

const sha256 = (bytes) =>
  `sha256:${createHash("sha256")
    .update(bytes)
    .digest("hex")}`;

const isPublicDocumentPath = (pathname) =>
  /(?:^|\/)d\/[A-Za-z0-9_-]+\.pdf$/.test(pathname);

const retentionNotBefore = (transportDate) => {
  const value = new Date(`${transportDate}T00:00:00.000Z`);

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  value.setUTCFullYear(value.getUTCFullYear() + 1);
  return value.toISOString();
};

export function createServer({
  publicBaseUrl =
    process.env.PUBLIC_BASE_URL ??
    "https://deca.example.com",
  store = null,
  artifactStore = null,
  platformServiceSecret =
    process.env.KAIROSETH_SERVICE_SECRET ?? null,
  runtimeMetrics =
    createRuntimeMetrics()
} = {}) {
  return http.createServer(async (request, response) => {
    const finishMetrics =
      runtimeMetrics.beginRequest();

    response.once(
      "finish",
      () => finishMetrics(response.statusCode)
    );

    try {
      const url = new URL(
        request.url,
        "http://localhost"
      );

      if (
        request.method === "GET" &&
        isPublicDocumentPath(url.pathname)
      ) {
        if (
          !requireOperationalStores(
            response,
            store,
            artifactStore
          )
        ) {
          return;
        }

        const version =
          await store.findDocumentVersionByAccessPath(
            url.pathname
          );

        if (!version?.artifact?.storageKey) {
          return sendJson(response, 404, {
            error: "document_not_found",
            message: "DeCA document was not found"
          });
        }

        let pdf;
        try {
          pdf = await artifactStore.read(
            version.artifact.storageKey
          );
        } catch (error) {
          if (error?.code === "ENOENT") {
            return sendJson(response, 404, {
              error: "document_not_found",
              message: "DeCA document artifact was not found"
            });
          }
          throw error;
        }

        if (
          version.artifact.sha256 &&
          sha256(pdf) !== version.artifact.sha256
        ) {
          return sendJson(response, 500, {
            error: "artifact_integrity_error",
            message:
              "Stored document failed integrity verification"
          });
        }

        return sendPdf(
          response,
          version.snapshot,
          pdf
        );
      }

      if (
        request.method === "GET" &&
        url.pathname === "/health"
      ) {
        return sendJson(response, 200, {
          status: "ok",
          service: "puente-deca"
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/ready"
      ) {
        if (
          !store ||
          !artifactStore ||
          typeof store.probe !== "function" ||
          typeof artifactStore.probe !== "function"
        ) {
          return sendJson(response, 503, {
            status: "not_ready",
            service: "puente-deca",
            components: {
              metadata: "unavailable",
              artifacts: "unavailable"
            }
          });
        }

        const [metadata, artifacts] =
          await Promise.allSettled([
            store.probe(),
            artifactStore.probe()
          ]);

        const metadataReady =
          metadata.status === "fulfilled";
        const artifactsReady =
          artifacts.status === "fulfilled";
        const ready =
          metadataReady && artifactsReady;

        return sendJson(
          response,
          ready ? 200 : 503,
          {
            status:
              ready
                ? "ready"
                : "not_ready",
            service: "puente-deca",
            components: {
              metadata:
                metadataReady
                  ? "ok"
                  : "unavailable",
              artifacts:
                artifactsReady
                  ? "ok"
                  : "unavailable"
            }
          }
        );
      }

      if (
        request.method === "GET" &&
        url.pathname === "/metrics"
      ) {
        const serviceSecret =
          request.headers[
            "x-kairoseth-service-secret"
          ];

        if (
          !secureSecretEqual(
            serviceSecret,
            platformServiceSecret
          )
        ) {
          return sendJson(response, 401, {
            error: "unauthorized",
            message:
              "Kairoseth service authentication is required"
          });
        }

        return sendText(
          response,
          200,
          runtimeMetrics.renderPrometheus()
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/deca/validate"
      ) {
        const payload = await readJson(request);
        const normalized =
          normalizeDecaRequest(payload);
        const validation =
          validateDecaRequest(normalized);

        return sendJson(
          response,
          validation.valid ? 200 : 422,
          {
            ...validation,
            normalized
          }
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/deca/snapshot"
      ) {
        const payload = await readJson(request);

        try {
          const snapshot = createSnapshot(
            payload,
            publicBaseUrl
          );
          return sendJson(response, 201, snapshot);
        } catch (error) {
          if (pdfErrorResponse(response, error)) return;
          throw error;
        }
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/deca/pdf"
      ) {
        const payload = await readJson(request);

        try {
          const snapshot = createSnapshot(
            payload,
            publicBaseUrl
          );
          const pdf =
            renderNativeDecaPdf(snapshot);

          return sendPdf(
            response,
            snapshot,
            pdf,
            { status: 201 }
          );
        } catch (error) {
          if (pdfErrorResponse(response, error)) return;
          throw error;
        }
      }

      const shipmentMatch =
        /^\/v1\/shipments\/([^/]+)$/.exec(
          url.pathname
        );

      const generateMatch =
        /^\/v1\/shipments\/([^/]+)\/deca$/.exec(
          url.pathname
        );

      const documentMatch =
        /^\/v1\/deca\/([^/]+)$/.exec(
          url.pathname
        );

      const credentialMatch =
        /^\/v1\/credentials\/([^/]+)$/.exec(
          url.pathname
        );

      if (
        request.method === "GET" &&
        url.pathname === "/v1/credentials"
      ) {
        if (!requireStore(response, store)) return;

        const platform =
          await authenticatePlatformService(
            request,
            response,
            store,
            platformServiceSecret
          );
        if (!platform) return;

        const credentials =
          await store.listApiCredentials(
            platform.organizationId
          );

        return sendJson(response, 200, {
          items: credentials
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/credentials"
      ) {
        if (!requireStore(response, store)) return;

        const platform =
          await authenticatePlatformService(
            request,
            response,
            store,
            platformServiceSecret
          );
        if (!platform) return;

        const payload = await readJson(request);
        const name =
          typeof payload?.name === "string"
            ? payload.name.trim()
            : "";
        const scopes =
          normalizeConnectorScopes(
            payload?.scopes
          );

        if (
          !name ||
          name.length > 120 ||
          !scopes
        ) {
          return sendJson(response, 422, {
            error: "invalid_credential_request",
            message:
              "Credential name and supported scopes are required"
          });
        }

        const created =
          await store.createApiCredential({
            organizationId:
              platform.organizationId,
            name,
            scopes
          });

        return sendJson(response, 201, {
          credential: created.credential,
          apiKey: created.apiKey
        });
      }

      if (
        request.method === "DELETE" &&
        credentialMatch
      ) {
        if (!requireStore(response, store)) return;

        const platform =
          await authenticatePlatformService(
            request,
            response,
            store,
            platformServiceSecret
          );
        if (!platform) return;

        try {
          const credential =
            await store.revokeApiCredential({
              organizationId:
                platform.organizationId,
              credentialId:
                decodeURIComponent(
                  credentialMatch[1]
                )
            });

          return sendJson(response, 200, {
            credential
          });
        } catch (error) {
          if (
            error?.code ===
            "API_CREDENTIAL_NOT_FOUND"
          ) {
            return sendJson(response, 404, {
              error: "credential_not_found",
              message:
                "Connector credential was not found"
            });
          }
          throw error;
        }
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/shipments"
      ) {
        if (
          !requireOperationalStores(
            response,
            store,
            artifactStore
          )
        ) {
          return;
        }

        const credential = await authenticate(
          request,
          response,
          store,
          "shipments:read",
          platformServiceSecret
        );
        if (!credential) return;

        const requestedLimit =
          Number.parseInt(
            url.searchParams.get("limit") ?? "50",
            10
          );
        const limit =
          Number.isInteger(requestedLimit)
            ? Math.min(
                100,
                Math.max(1, requestedLimit)
              )
            : 50;

        const shipments =
          await store.listShipments({
            organizationId:
              credential.organizationId,
            limit
          });

        return sendJson(
          response,
          200,
          shipments
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/shipments"
      ) {
        if (
          !requireOperationalStores(
            response,
            store,
            artifactStore
          )
        ) {
          return;
        }

        const credential = await authenticate(
          request,
          response,
          store,
          "shipments:write",
          platformServiceSecret
        );
        if (!credential) return;

        const payload = await readJson(request);
        const normalized =
          normalizeDecaRequest(payload);
        const validation =
          validateDecaRequest(normalized);

        if (!validation.valid) {
          return sendJson(
            response,
            422,
            validation
          );
        }

        if (
          typeof normalized.externalReference !==
            "string" ||
          normalized.externalReference.length === 0
        ) {
          return sendJson(response, 422, {
            valid: false,
            errors: [
              {
                path: "externalReference",
                code: "required",
                message:
                  "External shipment reference is required"
              }
            ]
          });
        }

        try {
          const shipment =
            await store.createShipment({
              organizationId:
                credential.organizationId,
              externalReference:
                normalized.externalReference,
              data: normalized,
              idempotencyKey:
                request.headers[
                  "idempotency-key"
                ] ?? null
            });

          return sendJson(
            response,
            shipment.idempotentReplay
              ? 200
              : 201,
            shipment
          );
        } catch (error) {
          if (
            error?.code ===
            "IDEMPOTENCY_CONFLICT"
          ) {
            return sendJson(response, 409, {
              error: "idempotency_conflict",
              message: error.message
            });
          }
          throw error;
        }
      }

      if (
        request.method === "PUT" &&
        shipmentMatch
      ) {
        if (
          !requireOperationalStores(
            response,
            store,
            artifactStore
          )
        ) {
          return;
        }

        const credential = await authenticate(
          request,
          response,
          store,
          "shipments:write",
          platformServiceSecret
        );
        if (!credential) return;

        const shipmentId =
          decodeURIComponent(
            shipmentMatch[1]
          );
        const existing =
          await store.getShipment({
            organizationId:
              credential.organizationId,
            shipmentId
          });

        if (!existing) {
          return sendJson(response, 404, {
            error: "shipment_not_found",
            message: "Shipment was not found"
          });
        }

        const payload = await readJson(request);
        const normalized =
          normalizeDecaRequest(payload);
        const validation =
          validateDecaRequest(normalized);

        if (!validation.valid) {
          return sendJson(
            response,
            422,
            validation
          );
        }

        if (
          normalized.externalReference !==
          existing.externalReference
        ) {
          return sendJson(response, 409, {
            error:
              "external_reference_immutable",
            message:
              "Shipment externalReference cannot be changed"
          });
        }

        const updated =
          await store.updateShipment({
            organizationId:
              credential.organizationId,
            shipmentId,
            data: normalized
          });

        return sendJson(
          response,
          200,
          updated
        );
      }

      if (
        request.method === "GET" &&
        shipmentMatch
      ) {
        if (
          !requireOperationalStores(
            response,
            store,
            artifactStore
          )
        ) {
          return;
        }

        const credential = await authenticate(
          request,
          response,
          store,
          "shipments:read",
          platformServiceSecret
        );
        if (!credential) return;

        const shipment =
          await store.getShipment({
            organizationId:
              credential.organizationId,
            shipmentId:
              decodeURIComponent(
                shipmentMatch[1]
              )
          });

        if (!shipment) {
          return sendJson(response, 404, {
            error: "shipment_not_found",
            message: "Shipment was not found"
          });
        }

        return sendJson(
          response,
          200,
          shipment
        );
      }

      if (
        request.method === "POST" &&
        generateMatch
      ) {
        if (
          !requireOperationalStores(
            response,
            store,
            artifactStore
          )
        ) {
          return;
        }

        const credential = await authenticate(
          request,
          response,
          store,
          "documents:write",
          platformServiceSecret
        );
        if (!credential) return;

        const shipmentId =
          decodeURIComponent(generateMatch[1]);
        const shipment =
          await store.getShipment({
            organizationId:
              credential.organizationId,
            shipmentId
          });

        if (!shipment) {
          return sendJson(response, 404, {
            error: "shipment_not_found",
            message: "Shipment was not found"
          });
        }

        try {
          let previous = null;
          const previousId =
            shipment.documentVersionIds.at(-1);

          if (previousId) {
            previous =
              await store.getDocumentVersion({
                organizationId:
                  credential.organizationId,
                documentId: previousId
              });
          }

          const candidate =
            createDocumentSnapshot(
              shipment.data,
              {
                baseUrl: publicBaseUrl
              }
            );

          if (
            previous &&
            previous.snapshot.contentHash ===
              candidate.contentHash
          ) {
            return sendJson(response, 200, {
              shipmentId,
              document: previous.snapshot,
              artifact: previous.artifact,
              reused: true
            });
          }

          const snapshot = previous
            ? reviseDocumentSnapshot(
                previous.snapshot,
                shipment.data,
                {
                  baseUrl: publicBaseUrl
                }
              )
            : candidate;

          const pdf =
            renderNativeDecaPdf(snapshot);
          const storedArtifact =
            await artifactStore.save({
              documentId:
                snapshot.documentId,
              bytes: pdf
            });

          const artifact = {
            ...storedArtifact,
            retentionNotBefore:
              retentionNotBefore(
                shipment.data.transport.date
              )
          };

          try {
            const version =
              await store.appendDocumentVersion({
                organizationId:
                  credential.organizationId,
                shipmentId,
                snapshot,
                artifact
              });

            return sendJson(response, 201, {
              shipmentId,
              document: version.snapshot,
              artifact: version.artifact,
              reused: false
            });
          } catch (error) {
            await artifactStore.remove(
              storedArtifact.storageKey
            );
            throw error;
          }
        } catch (error) {
          if (pdfErrorResponse(response, error)) return;
          throw error;
        }
      }

      if (
        request.method === "GET" &&
        documentMatch
      ) {
        if (
          !requireOperationalStores(
            response,
            store,
            artifactStore
          )
        ) {
          return;
        }

        const credential = await authenticate(
          request,
          response,
          store,
          "documents:read",
          platformServiceSecret
        );
        if (!credential) return;

        const version =
          await store.getDocumentVersion({
            organizationId:
              credential.organizationId,
            documentId:
              decodeURIComponent(
                documentMatch[1]
              )
          });

        if (!version) {
          return sendJson(response, 404, {
            error: "document_not_found",
            message: "DeCA document was not found"
          });
        }

        return sendJson(
          response,
          200,
          version
        );
      }

      return sendJson(response, 404, {
        error: "not_found",
        message: "Route not found"
      });
    } catch (error) {
      if (error?.code === "PAYLOAD_TOO_LARGE") {
        return sendJson(response, 413, {
          error: "payload_too_large",
          message:
            "Request body exceeds 1 MiB"
        });
      }

      if (error instanceof SyntaxError) {
        return sendJson(response, 400, {
          error: "invalid_json",
          message:
            "Request body must be valid JSON"
        });
      }

      return sendJson(response, 500, {
        error: "internal_error",
        message: "Unexpected server error"
      });
    }
  });
}
