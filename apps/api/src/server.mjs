import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  createConnectorPackage,
  supportedConnectorPackage
} from "./connector-package.mjs";
import {
  importCsvText
} from "../../../connectors/file-import/src/import.mjs";
import {
  importXlsx
} from "../../../connectors/file-import/src/xlsx.mjs";
import { normalizeDecaRequest } from "../../../packages/core/src/normalize-deca.mjs";
import { validateDecaRequest } from "../../../packages/core/src/validate-deca.mjs";
import {
  shipmentAggregateFromDeca
} from "../../../packages/core/src/shipment-adapter.mjs";
import {
  validateShipmentAggregate
} from "../../../packages/core/src/validate-shipment.mjs";
import {
  resolveDecaRequestFromShipment
} from "../../../packages/core/src/shipment-deca-view.mjs";
import {
  prepareEcmrDraft
} from "../../../packages/core/src/ecmr-draft.mjs";
import {
  serializeEcmrD25aEnvelope
} from "../../../packages/ecmr-xml/src/d25a-serializer.mjs";
import {
  createEcmrAmendmentChain,
  appendEcmrAmendment,
  verifyEcmrAmendmentChain
} from "../../../packages/ecmr-amendment/src/amendment-chain.mjs";
import {
  createDocumentSnapshot,
  reviseDocumentSnapshot
} from "../../../packages/document-engine/src/snapshot.mjs";
import { renderNativeDecaPdf } from "../../../packages/document-engine/src/pdf.mjs";
import {
  createRuntimeMetrics
} from "./metrics.mjs";
import {
  createFixedWindowRateLimiter
} from "./rate-limit.mjs";
import {
  publicShipmentResponse,
  publicShipmentListResponse
} from "./shipment-response.mjs";

const internalShipmentAggregate = (
  decaRequest
) => {
  const aggregate =
    shipmentAggregateFromDeca(
      decaRequest
    );
  const validation =
    validateShipmentAggregate(
      aggregate
    );

  if (!validation.valid) {
    const error = new Error(
      "Internal Shipment aggregate validation failed"
    );
    error.code =
      "SHIPMENT_AGGREGATE_INVALID";
    error.validationErrors =
      validation.errors;
    throw error;
  }

  return aggregate;
};

const aggregateFromShipmentRecord = (
  shipment
) => {
  if (
    shipment?.aggregate &&
    typeof shipment.aggregate ===
      "object" &&
    !Array.isArray(
      shipment.aggregate
    )
  ) {
    const validation =
      validateShipmentAggregate(
        shipment.aggregate
      );

    if (!validation.valid) {
      const error =
        new Error(
          "Persisted Shipment aggregate is invalid"
        );
      error.code =
        "SHIPMENT_AGGREGATE_INVALID";
      error.validationErrors =
        validation.errors;
      throw error;
    }

    return structuredClone(
      shipment.aggregate
    );
  }

  const legacyDeca =
    resolveDecaRequestFromShipment(
      shipment
    ).request;

  return internalShipmentAggregate(
    legacyDeca
  );
};

const prepareStructuredEcmr = (
  shipment,
  draft
) => {
  const aggregate =
    aggregateFromShipmentRecord(
      shipment
    );
  const prepared =
    prepareEcmrDraft({
      shipment:
        aggregate,
      input:
        draft
    });

  if (!prepared.validation.valid) {
    return {
      valid: false,
      projection:
        prepared.projection,
      validation:
        prepared.validation,
      wire: null,
      xml: null
    };
  }

  const wire =
    serializeEcmrD25aEnvelope(
      prepared.projection
    );

  return {
    valid: true,
    projection:
      prepared.projection,
    validation:
      prepared.validation,
    wire: {
      release:
        wire.release,
      rootSchema:
        wire.rootSchema,
      schemaConformance:
        wire.schemaConformance,
      mappedProjectionPaths:
        wire.mappedProjectionPaths,
      pendingProjectionPaths:
        wire.pendingProjectionPaths,
      contentHash:
        sha256(
          Buffer.from(
            wire.xml,
            "utf8"
          )
        )
    },
    xml:
      wire.xml
  };
};

const structuredEcmrPreviewResponse = (
  shipmentId,
  prepared
) => ({
  shipmentId,
  regulatoryType:
    "ecmr",
  valid:
    prepared.valid,
  projection:
    prepared.projection,
  validation:
    prepared.validation,
  wire:
    prepared.wire
});

const regulatoryVersionWithoutXml = (
  version
) => {
  const {
    xml: _xml,
    ...safe
  } = version;

  return safe;
};

const commonSecurityHeaders = () => ({
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer"
});

const sendText = (
  response,
  status,
  body,
  contentType = "text/plain; version=0.0.4; charset=utf-8"
) => {
  response.writeHead(status, {
    ...commonSecurityHeaders(),
    "content-type": contentType,
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
};

const sendJson = (response, status, body) => {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    ...commonSecurityHeaders(),
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data)
  });
  response.end(data);
};

const sendZip = (
  response,
  { filename, bytes, sha256 }
) => {
  response.writeHead(200, {
    ...commonSecurityHeaders(),
    "content-type": "application/zip",
    "content-length": bytes.length,
    "content-disposition":
      `attachment; filename="${filename}"`,
    "cache-control": "private, no-store",
    "x-connector-sha256": sha256
  });
  response.end(bytes);
};

const sendPdf = (
  response,
  snapshot,
  pdf,
  { status = 200 } = {}
) => {
  response.writeHead(status, {
    ...commonSecurityHeaders(),
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

const parseShipmentImportPayload = async (payload) => {
  const format = payload?.format;
  const dataBase64 = payload?.dataBase64;

  if (
    (format !== "csv" && format !== "xlsx") ||
    typeof dataBase64 !== "string" ||
    dataBase64.length === 0 ||
    dataBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)
  ) {
    return {
      ok: false,
      status: 422,
      error: "invalid_import_payload",
      message:
        "format must be csv/xlsx and dataBase64 must be valid base64"
    };
  }

  const bytes = Buffer.from(
    dataBase64,
    "base64"
  );

  if (
    bytes.length === 0 ||
    bytes.length > 512 * 1024
  ) {
    return {
      ok: false,
      status: 413,
      error: "import_file_size_limit",
      message:
        "Import file must be 512 KiB or smaller"
    };
  }

  let result;
  try {
    result =
      format === "csv"
        ? importCsvText(
            bytes.toString("utf8")
          )
        : await importXlsx(bytes);
  } catch {
    return {
      ok: false,
      status: 422,
      error: "invalid_import_file",
      message:
        "The import file could not be parsed"
    };
  }

  if (result.total > 500) {
    return {
      ok: false,
      status: 422,
      error: "import_row_limit",
      message:
        "Import files may contain at most 500 data rows"
    };
  }

  return {
    ok: true,
    format,
    result
  };
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
        "The embedded DeCA font set cannot represent all supplied characters",
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
  platformServiceSecret,
  rateLimiter = null
) => {
  const serviceSecret =
    request.headers["x-kairoseth-service-secret"];
  const serviceOrganizationId =
    request.headers["x-kairoseth-organization-id"];
  const serviceUserId =
    request.headers["x-kairoseth-user-id"];

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

  const actorUserId =
    serviceUserId === undefined
      ? null
      : typeof serviceUserId === "string" &&
          /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/.test(
            serviceUserId.trim()
          )
        ? serviceUserId.trim()
        : undefined;

  if (
    serviceUserId !== undefined &&
    actorUserId === undefined
  ) {
    sendJson(response, 401, {
      error: "unauthorized",
      message:
        "Kairoseth user context is invalid"
    });
    return null;
  }

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

  const credential = {
    credentialId: "kairoseth-platform",
    organizationId,
    scopes: [
      "shipments:read",
      "shipments:write",
      "documents:read",
      "documents:write",
      "regulatory:read",
      "regulatory:write"
    ],
    source: "kairoseth-platform",
    actorUserId
  };

  if (
    !enforceRateLimit(
      response,
      rateLimiter,
      credential
    )
  ) {
    return null;
  }

  return credential;
};

const authenticate = async (
  request,
  response,
  store,
  requiredScope,
  platformServiceSecret = null,
  rateLimiter = null
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
      platformServiceSecret,
      rateLimiter
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

  if (
    !enforceRateLimit(
      response,
      rateLimiter,
      credential
    )
  ) {
    return null;
  }

  return credential;
};

const enforceRateLimit = (
  response,
  rateLimiter,
  credential
) => {
  if (
    !rateLimiter ||
    typeof rateLimiter.consume !== "function"
  ) {
    return true;
  }

  const key =
    credential.source ===
    "kairoseth-platform"
      ? `platform:${credential.organizationId}`
      : `connector:${credential.credentialId}`;

  const limit = rateLimiter.consume(key);

  if (limit.allowed) {
    return true;
  }

  response.setHeader(
    "retry-after",
    String(limit.retryAfterSeconds)
  );
  response.setHeader(
    "x-ratelimit-limit",
    String(limit.limit)
  );
  response.setHeader(
    "x-ratelimit-remaining",
    "0"
  );

  sendJson(response, 429, {
    error: "rate_limited",
    message:
      "Too many authenticated requests"
  });

  return false;
};

const normalizeCredentialExpiry = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? undefined
    : date;
};

const CONNECTOR_KINDS = [
  "woocommerce",
  "prestashop",
  "api"
];

const normalizeConnectorKind = (value) => {
  if (value === undefined || value === null || value === "") {
    return "api";
  }

  if (
    typeof value !== "string" ||
    !CONNECTOR_KINDS.includes(
      value.trim().toLowerCase()
    )
  ) {
    return null;
  }

  return value.trim().toLowerCase();
};

const DEFAULT_CONNECTOR_SCOPES = [
  "shipments:read",
  "shipments:write",
  "documents:read",
  "documents:write"
];

const CONNECTOR_SCOPES = [
  ...DEFAULT_CONNECTOR_SCOPES,
  "regulatory:read",
  "regulatory:write"
];

const normalizeConnectorScopes = (value) => {
  if (value === undefined) {
    return [...DEFAULT_CONNECTOR_SCOPES];
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

const normalizeRegulatoryPartyRole = (
  value
) => {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim().toLowerCase();

  return /^[a-z][a-z0-9_-]{0,63}$/.test(
    normalized
  )
    ? normalized
    : null;
};

const normalizeAmendmentReason = (
  value
) => {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return (
    normalized.length >= 1 &&
    normalized.length <= 500
  )
    ? normalized
    : null;
};

const normalizeEcmrXml = (
  value
) => {
  if (
    typeof value !== "string" ||
    value.length > 950_000 ||
    value.trim().length === 0
  ) {
    return null;
  }

  return value;
};

const amendmentActorFromCredential = (
  credential,
  partyRole
) => {
  const humanUserId =
    credential.source ===
        "kairoseth-platform" &&
      typeof credential.actorUserId ===
        "string" &&
      credential.actorUserId.length > 0
      ? credential.actorUserId
      : null;

  return {
    actorId:
      humanUserId
        ? `kairoseth-user:${humanUserId}`
        : credential.source ===
              "kairoseth-platform"
          ? `kairoseth-platform:${credential.organizationId}`
          : `credential:${credential.credentialId}`,
    partyRole,
    identityScheme:
      humanUserId
        ? "kairoseth-user"
        : credential.source ===
              "kairoseth-platform"
          ? "kairoseth-platform-service"
          : "kairoseth-api-credential"
  };
};

const amendmentInstant = (
  now,
  latest
) => {
  const raw =
    typeof now === "function"
      ? now()
      : new Date();
  const date =
    raw instanceof Date
      ? new Date(
          raw.getTime()
        )
      : new Date(raw);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    const error =
      new Error(
        "Server clock returned an invalid amendment timestamp"
      );
    error.code =
      "ECMR_SERVER_CLOCK_INVALID";
    throw error;
  }

  if (
    latest?.createdAt
  ) {
    const previous =
      new Date(
        latest.createdAt
      );

    if (
      !Number.isNaN(
        previous.getTime()
      ) &&
      date.getTime() <=
        previous.getTime()
    ) {
      return new Date(
        previous.getTime() + 1
      ).toISOString();
    }
  }

  return date.toISOString();
};

const sha256 = (bytes) =>
  `sha256:${createHash("sha256")
    .update(bytes)
    .digest("hex")}`;

const isPublicDocumentPath = (pathname) =>
  /(?:^|\/)d\/[A-Za-z0-9_-]+\.pdf$/.test(pathname);

const usageWindowFromUrl = (url) => {
  const from = new Date(url.searchParams.get("from") ?? "");
  const to = new Date(url.searchParams.get("to") ?? "");

  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from >= to
  ) {
    return null;
  }

  const maxWindowMs = 370 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxWindowMs) {
    return null;
  }

  return { from, to };
};

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
    createRuntimeMetrics(),
  rateLimiter =
    createFixedWindowRateLimiter({
      windowMs:
        process.env.RATE_LIMIT_WINDOW_MS,
      maxRequests:
        process.env.RATE_LIMIT_MAX_REQUESTS,
      maxEntries:
        process.env.RATE_LIMIT_MAX_ENTRIES
    }),
  standaloneToolsEnabled =
    process.env.NODE_ENV !== "production",
  now = () => new Date()
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

      const standaloneToolPath =
        request.method === "POST" &&
        (
          url.pathname === "/v1/deca/validate" ||
          url.pathname === "/v1/deca/snapshot" ||
          url.pathname === "/v1/deca/pdf"
        );

      if (
        standaloneToolPath &&
        !standaloneToolsEnabled
      ) {
        return sendJson(response, 404, {
          error: "not_found",
          message: "Route not found"
        });
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
            await renderNativeDecaPdf(snapshot);

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

      if (
        request.method === "GET" &&
        url.pathname === "/v1/access/connectors"
      ) {
        if (!requireStore(response, store)) return;

        const platform =
          await authenticatePlatformService(
            request,
            response,
            store,
            platformServiceSecret,
            rateLimiter
          );
        if (!platform) return;

        const organization =
          await store.getOrganization(
            platform.organizationId
          );

        if (!organization) {
          return sendJson(response, 404, {
            error: "organization_not_found",
            message: "Organization does not exist"
          });
        }

        return sendJson(response, 200, {
          organizationId:
            platform.organizationId,
          validUntil:
            organization.connectorAccessUntil ??
            null
        });
      }

      if (
        request.method === "PUT" &&
        url.pathname === "/v1/access/connectors"
      ) {
        if (!requireStore(response, store)) return;

        const platform =
          await authenticatePlatformService(
            request,
            response,
            store,
            platformServiceSecret,
            rateLimiter
          );
        if (!platform) return;

        const payload = await readJson(request);
        const validUntil =
          new Date(payload?.validUntil ?? "");

        if (
          Number.isNaN(validUntil.getTime()) ||
          typeof store.setOrganizationConnectorAccessUntil !==
            "function"
        ) {
          return sendJson(response, 422, {
            error: "invalid_connector_access",
            message:
              "A valid connector access expiry is required"
          });
        }

        const organization =
          await store.setOrganizationConnectorAccessUntil({
            organizationId:
              platform.organizationId,
            validUntil
          });

        return sendJson(response, 200, {
          organizationId:
            platform.organizationId,
          validUntil:
            organization.connectorAccessUntil ??
            validUntil.toISOString()
        });
      }

      const connectorPackageMatch =
        /^\/v1\/connectors\/(woocommerce|prestashop)\/package$/.exec(
          url.pathname
        );

      if (
        request.method === "GET" &&
        connectorPackageMatch
      ) {
        if (!requireStore(response, store)) return;

        const platform =
          await authenticatePlatformService(
            request,
            response,
            store,
            platformServiceSecret,
            rateLimiter
          );
        if (!platform) return;

        const connector =
          connectorPackageMatch[1];

        if (!supportedConnectorPackage(connector)) {
          return sendJson(response, 404, {
            error: "connector_package_not_found",
            message:
              "Connector package was not found"
          });
        }

        const packageArtifact =
          await createConnectorPackage(connector);

        return sendZip(
          response,
          packageArtifact
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/import/preview"
      ) {
        if (!requireStore(response, store)) return;

        const platform =
          await authenticatePlatformService(
            request,
            response,
            store,
            platformServiceSecret,
            rateLimiter
          );
        if (!platform) return;

        const payload = await readJson(request);
        const parsed =
          await parseShipmentImportPayload(
            payload
          );

        if (!parsed.ok) {
          return sendJson(
            response,
            parsed.status,
            {
              error: parsed.error,
              message: parsed.message
            }
          );
        }

        const { format, result } = parsed;

        return sendJson(response, 200, {
          format,
          total: result.total,
          valid: result.valid,
          invalid: result.invalid,
          records: result.records
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/import/shipments"
      ) {
        if (!requireStore(response, store)) return;

        const platform =
          await authenticatePlatformService(
            request,
            response,
            store,
            platformServiceSecret,
            rateLimiter
          );
        if (!platform) return;

        const payload = await readJson(request);
        const parsed =
          await parseShipmentImportPayload(
            payload
          );

        if (!parsed.ok) {
          return sendJson(
            response,
            parsed.status,
            {
              error: parsed.error,
              message: parsed.message
            }
          );
        }

        const { format, result } = parsed;

        if (result.invalid > 0) {
          return sendJson(response, 422, {
            error: "import_validation_failed",
            message:
              "Every import row must be valid before shipments are created",
            format,
            total: result.total,
            valid: result.valid,
            invalid: result.invalid,
            records: result.records
          });
        }

        const items = [];
        let created = 0;
        let replayed = 0;
        let conflicts = 0;

        for (const record of result.records) {
          try {
            const shipment =
              await store.createShipment({
                organizationId:
                  platform.organizationId,
                externalReference:
                  record.request.externalReference,
                data: record.request,
                aggregate:
                  internalShipmentAggregate(
                    record.request
                  ),
                idempotencyKey:
                  `file-import:${record.request.externalReference}:v1`
              });

            if (shipment.idempotentReplay) {
              replayed += 1;
            } else {
              created += 1;
            }

            items.push({
              rowNumber: record.rowNumber,
              externalReference:
                record.request.externalReference,
              shipmentId:
                shipment.shipmentId,
              idempotentReplay:
                shipment.idempotentReplay === true,
              status:
                shipment.idempotentReplay
                  ? "replayed"
                  : "created"
            });
          } catch (error) {
            if (
              error?.code ===
              "IDEMPOTENCY_CONFLICT"
            ) {
              conflicts += 1;
              items.push({
                rowNumber: record.rowNumber,
                externalReference:
                  record.request.externalReference,
                shipmentId: null,
                idempotentReplay: false,
                status: "conflict"
              });
              continue;
            }
            throw error;
          }
        }

        return sendJson(
          response,
          conflicts > 0
            ? 409
            : created > 0
              ? 201
              : 200,
          {
            format,
            total: result.total,
            created,
            replayed,
            conflicts,
            items
          }
        );
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/usage/documents"
      ) {
        if (!requireStore(response, store)) return;

        const platform =
          await authenticatePlatformService(
            request,
            response,
            store,
            platformServiceSecret,
            rateLimiter
          );
        if (!platform) return;

        const window =
          usageWindowFromUrl(url);

        if (
          !window ||
          typeof store.countDocumentVersions !==
            "function"
        ) {
          return sendJson(response, 400, {
            error: "invalid_usage_window",
            message:
              "A valid from/to usage window is required"
          });
        }

        const documents =
          await store.countDocumentVersions({
            organizationId:
              platform.organizationId,
            from: window.from,
            to: window.to
          });

        return sendJson(response, 200, {
          organizationId:
            platform.organizationId,
          from: window.from.toISOString(),
          to: window.to.toISOString(),
          documents
        });
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

      const ecmrVersionsMatch =
        /^\/v1\/shipments\/([^/]+)\/ecmr\/versions$/.exec(
          url.pathname
        );

      const credentialMatch =
        /^\/v1\/credentials\/([^/]+)$/.exec(
          url.pathname
        );

      if (
        request.method === "GET" &&
        ecmrVersionsMatch
      ) {
        if (!requireStore(response, store)) return;

        const credential =
          await authenticate(
            request,
            response,
            store,
            "regulatory:read",
            platformServiceSecret,
            rateLimiter
          );
        if (!credential) return;

        const shipmentId =
          decodeURIComponent(
            ecmrVersionsMatch[1]
          );
        const shipment =
          await store.getShipment({
            organizationId:
              credential.organizationId,
            shipmentId
          });

        if (!shipment) {
          return sendJson(
            response,
            404,
            {
              error:
                "shipment_not_found",
              message:
                "Shipment was not found"
            }
          );
        }

        const versions =
          await store
            .listRegulatoryVersions({
              organizationId:
                credential.organizationId,
              shipmentId,
              regulatoryType:
                "ecmr"
            });

        if (
          versions.length > 0
        ) {
          const verification =
            verifyEcmrAmendmentChain(
              versions
            );

          if (!verification.valid) {
            return sendJson(
              response,
              500,
              {
                error:
                  "ecmr_history_integrity_failure",
                message:
                  "Stored eCMR amendment history failed integrity verification"
              }
            );
          }
        }

        return sendJson(
          response,
          200,
          {
            shipmentId,
            regulatoryType:
              "ecmr",
            total:
              versions.length,
            head:
              versions.at(-1)
                ? {
                    version:
                      versions.at(-1)
                        .version,
                    versionId:
                      versions.at(-1)
                        .versionId,
                    contentHash:
                      versions.at(-1)
                        .contentHash,
                    chainHash:
                      versions.at(-1)
                        .chainHash
                  }
                : null,
            versions
          }
        );
      }

      if (
        request.method === "POST" &&
        ecmrVersionsMatch
      ) {
        if (!requireStore(response, store)) return;

        const credential =
          await authenticate(
            request,
            response,
            store,
            "regulatory:write",
            platformServiceSecret,
            rateLimiter
          );
        if (!credential) return;

        const shipmentId =
          decodeURIComponent(
            ecmrVersionsMatch[1]
          );
        const shipment =
          await store.getShipment({
            organizationId:
              credential.organizationId,
            shipmentId
          });

        if (!shipment) {
          return sendJson(
            response,
            404,
            {
              error:
                "shipment_not_found",
              message:
                "Shipment was not found"
            }
          );
        }

        const payload =
          await readJson(request);
        const xml =
          normalizeEcmrXml(
            payload?.xml
          );
        const reason =
          normalizeAmendmentReason(
            payload?.reason
          );
        const partyRole =
          normalizeRegulatoryPartyRole(
            payload?.partyRole
          );
        const rawExpectedHead =
          payload
            ?.expectedPreviousVersionId;
        const expectedPreviousVersionId =
          rawExpectedHead === null
            ? null
            : typeof rawExpectedHead ===
                  "string" &&
                rawExpectedHead
                  .trim()
                  .length > 0
              ? rawExpectedHead.trim()
              : undefined;

        if (
          !xml ||
          !reason ||
          !partyRole ||
          expectedPreviousVersionId ===
            undefined
        ) {
          return sendJson(
            response,
            422,
            {
              error:
                "invalid_ecmr_amendment_request",
              message:
                "xml, reason, partyRole and a valid expectedPreviousVersionId are required"
            }
          );
        }

        const versions =
          await store
            .listRegulatoryVersions({
              organizationId:
                credential.organizationId,
              shipmentId,
              regulatoryType:
                "ecmr"
            });
        const latest =
          versions.at(-1) ??
          null;
        const currentHead =
          latest?.versionId ??
          null;

        if (
          expectedPreviousVersionId !==
          currentHead
        ) {
          return sendJson(
            response,
            409,
            {
              error:
                "ecmr_stale_head",
              message:
                "expectedPreviousVersionId does not match the current accepted eCMR head",
              currentVersionId:
                currentHead,
              currentVersion:
                latest?.version ??
                0
            }
          );
        }

        const actor =
          amendmentActorFromCredential(
            credential,
            partyRole
          );
        const createdAt =
          amendmentInstant(
            now,
            latest
          );

        let record;

        try {
          if (!latest) {
            record =
              createEcmrAmendmentChain({
                xml,
                actor,
                reason,
                createdAt
              })[0];
          } else {
            record =
              appendEcmrAmendment({
                chain:
                  versions,
                xml,
                actor,
                reason,
                createdAt
              }).at(-1);
          }

          const stored =
            await store
              .appendRegulatoryVersion({
                organizationId:
                  credential.organizationId,
                shipmentId,
                regulatoryType:
                  "ecmr",
                record
              });

          return sendJson(
            response,
            201,
            {
              shipmentId,
              regulatoryType:
                "ecmr",
              version:
                stored,
              head: {
                version:
                  stored.version,
                versionId:
                  stored.versionId,
                contentHash:
                  stored.contentHash,
                chainHash:
                  stored.chainHash
              }
            }
          );
        } catch (error) {
          if (
            [
              "REGULATORY_VERSION_CONFLICT",
              "REGULATORY_VERSION_HEAD_CONFLICT",
              "ECMR_AMENDMENT_NO_CHANGE",
              "ECMR_AMENDMENT_CHAIN_INVALID",
              "ECMR_AMENDMENT_TIME_ORDER_INVALID"
            ].includes(
              error?.code
            )
          ) {
            return sendJson(
              response,
              409,
              {
                error:
                  "ecmr_version_conflict",
                message:
                  "eCMR amendment could not extend the current accepted head"
              }
            );
          }

          if (
            typeof error?.code ===
              "string" &&
            error.code.startsWith(
              "ECMR_AMENDMENT_"
            )
          ) {
            return sendJson(
              response,
              422,
              {
                error:
                  "invalid_ecmr_amendment",
                message:
                  "eCMR amendment input was rejected"
              }
            );
          }

          throw error;
        }
      }

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
            platformServiceSecret,
            rateLimiter
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
            platformServiceSecret,
            rateLimiter
          );
        if (!platform) return;

        const payload = await readJson(request);
        const name =
          typeof payload?.name === "string"
            ? payload.name.trim()
            : "";
        const kind =
          normalizeConnectorKind(
            payload?.kind
          );
        const scopes =
          normalizeConnectorScopes(
            payload?.scopes
          );
        const expiresAt =
          normalizeCredentialExpiry(
            payload?.expiresAt
          );

        if (
          !name ||
          name.length > 120 ||
          !kind ||
          !scopes ||
          expiresAt === undefined
        ) {
          return sendJson(response, 422, {
            error: "invalid_credential_request",
            message:
              "Credential name, kind and supported scopes are required"
          });
        }

        try {
          const created =
            await store.createApiCredential({
              organizationId:
                platform.organizationId,
              name,
              kind,
              scopes,
              expiresAt
            });

          return sendJson(response, 201, {
            credential: created.credential,
            apiKey: created.apiKey
          });
        } catch (error) {
          if (
            error?.code ===
            "ORGANIZATION_CONNECTOR_ACCESS_INACTIVE"
          ) {
            return sendJson(response, 403, {
              error:
                "connector_access_inactive",
              message:
                "Organization connector access is inactive"
            });
          }
          throw error;
        }
      }

      if (
        request.method === "PATCH" &&
        url.pathname === "/v1/credentials"
      ) {
        if (!requireStore(response, store)) return;

        const platform =
          await authenticatePlatformService(
            request,
            response,
            store,
            platformServiceSecret,
            rateLimiter
          );
        if (!platform) return;

        const payload = await readJson(request);
        const expiresAt =
          normalizeCredentialExpiry(
            payload?.expiresAt
          );

        if (
          expiresAt === undefined ||
          typeof store.setApiCredentialExpiryForOrganization !==
            "function"
        ) {
          return sendJson(response, 422, {
            error: "invalid_credential_expiry",
            message:
              "expiresAt must be null or a valid ISO date-time"
          });
        }

        const result =
          await store.setApiCredentialExpiryForOrganization({
            organizationId:
              platform.organizationId,
            expiresAt
          });

        return sendJson(response, 200, result);
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
            platformServiceSecret,
            rateLimiter
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
          platformServiceSecret,
          rateLimiter
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
          publicShipmentListResponse(
            shipments
          )
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
          platformServiceSecret,
          rateLimiter
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
              aggregate:
                internalShipmentAggregate(
                  normalized
                ),
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
            publicShipmentResponse(
              shipment
            )
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
          platformServiceSecret,
          rateLimiter
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
            data: normalized,
            aggregate:
              internalShipmentAggregate(
                normalized
              )
          });

        return sendJson(
          response,
          200,
          publicShipmentResponse(
            updated
          )
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
          platformServiceSecret,
          rateLimiter
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
          publicShipmentResponse(
            shipment
          )
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
          platformServiceSecret,
          rateLimiter
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

          const shipmentView =
            resolveDecaRequestFromShipment(
              shipment
            );
          const decaRequest =
            shipmentView.request;

          const candidate =
            createDocumentSnapshot(
              decaRequest,
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
                decaRequest,
                {
                  baseUrl: publicBaseUrl
                }
              )
            : candidate;

          const pdf =
            await renderNativeDecaPdf(snapshot);
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
                decaRequest.transport.date
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
          platformServiceSecret,
          rateLimiter
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
