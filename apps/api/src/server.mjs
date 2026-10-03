import http from "node:http";
import { normalizeDecaRequest } from "../../../packages/core/src/normalize-deca.mjs";
import { validateDecaRequest } from "../../../packages/core/src/validate-deca.mjs";
import {
  createDocumentSnapshot,
  reviseDocumentSnapshot
} from "../../../packages/document-engine/src/snapshot.mjs";
import { renderNativeDecaPdf } from "../../../packages/document-engine/src/pdf.mjs";

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
  {
    status = 200,
    documentId,
    version = null,
    disposition = "attachment",
    pdf
  }
) => {
  const headers = {
    "content-type": "application/pdf",
    "content-length": pdf.length,
    "content-disposition":
      `${disposition}; filename="${documentId}.pdf"`,
    "cache-control": "no-store",
    "x-deca-document-id": documentId
  };

  if (version !== null) {
    headers["x-deca-version"] = String(version);
  }

  response.writeHead(status, headers);
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

const extractApiKey = (request) => {
  const authorization = request.headers.authorization;

  if (
    typeof authorization === "string" &&
    authorization.toLowerCase().startsWith("bearer ")
  ) {
    return authorization.slice(7).trim();
  }

  const apiKey = request.headers["x-api-key"];

  if (Array.isArray(apiKey)) {
    return apiKey[0]?.trim() ?? "";
  }

  return typeof apiKey === "string" ? apiKey.trim() : "";
};

const requireCredential = async (
  request,
  response,
  store,
  scope
) => {
  if (!store) {
    sendJson(response, 503, {
      error: "persistence_unavailable",
      message: "Operational persistence is not configured"
    });
    return null;
  }

  const apiKey = extractApiKey(request);
  const credential = apiKey
    ? await store.authenticateApiKey(apiKey)
    : null;

  if (!credential) {
    response.setHeader("www-authenticate", "Bearer");
    sendJson(response, 401, {
      error: "unauthorized",
      message: "A valid API key is required"
    });
    return null;
  }

  if (!credential.scopes.includes(scope)) {
    sendJson(response, 403, {
      error: "forbidden",
      message: `API credential is missing scope ${scope}`
    });
    return null;
  }

  return credential;
};

const validateShipmentData = (input) => {
  const normalized = normalizeDecaRequest(input);
  const validation = validateDecaRequest(normalized);

  return {
    normalized,
    validation
  };
};

const publicDocumentPath = (pathname) =>
  /(?:^|\/)d\/[A-Za-z0-9_-]+\.pdf$/.test(pathname);

const minimumRetentionUntil = (transportDate) => {
  const date = new Date(`${transportDate}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) return null;

  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
};

const operationalError = (response, error) => {
  const conflicts = new Set([
    "IDEMPOTENCY_CONFLICT",
    "DOCUMENT_VERSION_EXISTS",
    "ARTIFACT_EXISTS"
  ]);

  const notFound = new Set([
    "ORGANIZATION_NOT_FOUND",
    "SHIPMENT_NOT_FOUND",
    "API_CREDENTIAL_NOT_FOUND"
  ]);

  if (conflicts.has(error?.code)) {
    sendJson(response, 409, {
      error: error.code.toLowerCase(),
      message: error.message
    });
    return true;
  }

  if (notFound.has(error?.code)) {
    sendJson(response, 404, {
      error: error.code.toLowerCase(),
      message: error.message
    });
    return true;
  }

  return false;
};

export function createServer({
  publicBaseUrl = process.env.PUBLIC_BASE_URL ?? "https://deca.example.com",
  store = null,
  artifactStore = null
} = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");

      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, {
          status: "ok",
          service: "puente-deca",
          persistence: store ? "configured" : "disabled",
          artifacts: artifactStore ? "configured" : "disabled"
        });
      }

      if (
        request.method === "GET" &&
        publicDocumentPath(url.pathname)
      ) {
        if (!store || !artifactStore) {
          return sendJson(response, 503, {
            error: "document_store_unavailable",
            message: "Document storage is not configured"
          });
        }

        const version =
          await store.findDocumentVersionByAccessPath(url.pathname);

        if (!version?.artifact?.storageKey) {
          return sendJson(response, 404, {
            error: "document_not_found",
            message: "Document not found"
          });
        }

        let pdf;
        try {
          pdf = await artifactStore.read(version.artifact.storageKey);
        } catch (error) {
          if (error?.code === "ENOENT") {
            return sendJson(response, 404, {
              error: "document_not_found",
              message: "Document artifact not found"
            });
          }
          throw error;
        }

        return sendPdf(response, {
          status: 200,
          documentId: version.documentId,
          version: version.version,
          pdf
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/deca/validate") {
        const payload = await readJson(request);
        const normalized = normalizeDecaRequest(payload);
        const validation = validateDecaRequest(normalized);

        return sendJson(response, validation.valid ? 200 : 422, {
          ...validation,
          normalized
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/deca/snapshot") {
        const payload = await readJson(request);

        try {
          const snapshot = createSnapshot(payload, publicBaseUrl);
          return sendJson(response, 201, snapshot);
        } catch (error) {
          if (error?.code === "DECA_VALIDATION_FAILED") {
            return sendJson(response, 422, error.validation);
          }
          throw error;
        }
      }

      if (request.method === "POST" && url.pathname === "/v1/deca/pdf") {
        const payload = await readJson(request);

        try {
          const snapshot = createSnapshot(payload, publicBaseUrl);
          const pdf = renderNativeDecaPdf(snapshot);
          return sendPdf(response, {
            status: 201,
            documentId: snapshot.documentId,
            version: snapshot.version,
            pdf
          });
        } catch (error) {
          if (error?.code === "DECA_VALIDATION_FAILED") {
            return sendJson(response, 422, error.validation);
          }

          if (error?.code === "DECA_PDF_UNSUPPORTED_CHARACTER") {
            return sendJson(response, 422, {
              error: "unsupported_pdf_character",
              message:
                "The current PDF font cannot represent all supplied characters",
              character: error.character,
              codePoint: error.codePoint
            });
          }

          throw error;
        }
      }

      if (request.method === "POST" && url.pathname === "/v1/shipments") {
        const credential = await requireCredential(
          request,
          response,
          store,
          "shipments:write"
        );
        if (!credential) return;

        const payload = await readJson(request);
        const sourceData = payload.data ?? payload;
        const { normalized, validation } =
          validateShipmentData(sourceData);

        if (!validation.valid) {
          return sendJson(response, 422, validation);
        }

        const externalReference =
          payload.externalReference ??
          normalized.externalReference;
        const idempotencyHeader =
          request.headers["idempotency-key"];
        const idempotencyKey = Array.isArray(idempotencyHeader)
          ? idempotencyHeader[0]
          : idempotencyHeader ?? null;

        try {
          const shipment = await store.createShipment({
            organizationId: credential.organizationId,
            externalReference,
            data: normalized,
            idempotencyKey
          });

          return sendJson(
            response,
            shipment.idempotentReplay ? 200 : 201,
            shipment
          );
        } catch (error) {
          if (operationalError(response, error)) return;
          throw error;
        }
      }

      const generateMatch =
        url.pathname.match(/^\/v1\/shipments\/([^/]+)\/deca$/);

      if (request.method === "POST" && generateMatch) {
        const credential = await requireCredential(
          request,
          response,
          store,
          "documents:write"
        );
        if (!credential) return;

        if (!artifactStore) {
          return sendJson(response, 503, {
            error: "document_store_unavailable",
            message: "Document storage is not configured"
          });
        }

        const shipmentId = decodeURIComponent(generateMatch[1]);
        const shipment = await store.getShipment({
          organizationId: credential.organizationId,
          shipmentId
        });

        if (!shipment) {
          return sendJson(response, 404, {
            error: "shipment_not_found",
            message: "Shipment not found"
          });
        }

        let previousVersion = null;
        const lastDocumentId =
          shipment.documentVersionIds.at(-1) ?? null;

        if (lastDocumentId) {
          previousVersion = await store.getDocumentVersion({
            organizationId: credential.organizationId,
            documentId: lastDocumentId
          });
        }

        const firstCandidate = createDocumentSnapshot(
          shipment.data,
          { baseUrl: publicBaseUrl }
        );

        if (
          previousVersion &&
          previousVersion.snapshot.contentHash ===
            firstCandidate.contentHash
        ) {
          return sendJson(response, 200, {
            ...previousVersion,
            reused: true
          });
        }

        const snapshot = previousVersion
          ? reviseDocumentSnapshot(
              previousVersion.snapshot,
              shipment.data,
              { baseUrl: publicBaseUrl }
            )
          : firstCandidate;

        let pdf;
        try {
          pdf = renderNativeDecaPdf(snapshot);
        } catch (error) {
          if (error?.code === "DECA_PDF_UNSUPPORTED_CHARACTER") {
            return sendJson(response, 422, {
              error: "unsupported_pdf_character",
              message:
                "The current PDF font cannot represent all supplied characters",
              character: error.character,
              codePoint: error.codePoint
            });
          }
          throw error;
        }

        const artifact = await artifactStore.save({
          documentId: snapshot.documentId,
          bytes: pdf
        });

        const artifactWithRetention = {
          ...artifact,
          minimumRetainUntil:
            minimumRetentionUntil(shipment.data.transport.date)
        };

        try {
          const version = await store.appendDocumentVersion({
            organizationId: credential.organizationId,
            shipmentId,
            snapshot,
            artifact: artifactWithRetention
          });

          return sendJson(response, 201, {
            ...version,
            reused: false
          });
        } catch (error) {
          await artifactStore.remove(artifact.storageKey);
          if (operationalError(response, error)) return;
          throw error;
        }
      }

      const shipmentMatch =
        url.pathname.match(/^\/v1\/shipments\/([^/]+)$/);

      if (request.method === "GET" && shipmentMatch) {
        const credential = await requireCredential(
          request,
          response,
          store,
          "shipments:read"
        );
        if (!credential) return;

        const shipment = await store.getShipment({
          organizationId: credential.organizationId,
          shipmentId: decodeURIComponent(shipmentMatch[1])
        });

        if (!shipment) {
          return sendJson(response, 404, {
            error: "shipment_not_found",
            message: "Shipment not found"
          });
        }

        return sendJson(response, 200, shipment);
      }

      const documentPdfMatch =
        url.pathname.match(/^\/v1\/deca\/([^/]+)\.pdf$/);

      if (request.method === "GET" && documentPdfMatch) {
        const credential = await requireCredential(
          request,
          response,
          store,
          "documents:read"
        );
        if (!credential) return;

        if (!artifactStore) {
          return sendJson(response, 503, {
            error: "document_store_unavailable",
            message: "Document storage is not configured"
          });
        }

        const version = await store.getDocumentVersion({
          organizationId: credential.organizationId,
          documentId: decodeURIComponent(documentPdfMatch[1])
        });

        if (!version?.artifact?.storageKey) {
          return sendJson(response, 404, {
            error: "document_not_found",
            message: "Document not found"
          });
        }

        const pdf = await artifactStore.read(
          version.artifact.storageKey
        );

        return sendPdf(response, {
          status: 200,
          documentId: version.documentId,
          version: version.version,
          pdf
        });
      }

      const documentMatch =
        url.pathname.match(/^\/v1\/deca\/([^/]+)$/);

      if (request.method === "GET" && documentMatch) {
        const credential = await requireCredential(
          request,
          response,
          store,
          "documents:read"
        );
        if (!credential) return;

        const version = await store.getDocumentVersion({
          organizationId: credential.organizationId,
          documentId: decodeURIComponent(documentMatch[1])
        });

        if (!version) {
          return sendJson(response, 404, {
            error: "document_not_found",
            message: "Document not found"
          });
        }

        return sendJson(response, 200, version);
      }

      return sendJson(response, 404, {
        error: "not_found",
        message: "Route not found"
      });
    } catch (error) {
      if (error?.code === "PAYLOAD_TOO_LARGE") {
        return sendJson(response, 413, {
          error: "payload_too_large",
          message: "Request body exceeds 1 MiB"
        });
      }

      if (error instanceof SyntaxError) {
        return sendJson(response, 400, {
          error: "invalid_json",
          message: "Request body must be valid JSON"
        });
      }

      if (error instanceof TypeError) {
        return sendJson(response, 400, {
          error: "invalid_request",
          message: error.message
        });
      }

      if (operationalError(response, error)) return;

      return sendJson(response, 500, {
        error: "internal_error",
        message: "Unexpected server error"
      });
    }
  });
}
