import http from "node:http";
import { normalizeDecaRequest } from "../../../packages/core/src/normalize-deca.mjs";
import { validateDecaRequest } from "../../../packages/core/src/validate-deca.mjs";
import { createDocumentSnapshot } from "../../../packages/document-engine/src/snapshot.mjs";
import { renderNativeDecaPdf } from "../../../packages/document-engine/src/pdf.mjs";

const sendJson = (response, status, body) => {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data)
  });
  response.end(data);
};

const sendPdf = (response, snapshot, pdf) => {
  response.writeHead(201, {
    "content-type": "application/pdf",
    "content-length": pdf.length,
    "content-disposition":
      `attachment; filename="${snapshot.documentId}.pdf"`,
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

export function createServer({
  publicBaseUrl = process.env.PUBLIC_BASE_URL ?? "https://deca.example.com"
} = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");

      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, {
          status: "ok",
          service: "puente-deca"
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
          return sendPdf(response, snapshot, pdf);
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

      return sendJson(response, 500, {
        error: "internal_error",
        message: "Unexpected server error"
      });
    }
  });
}
