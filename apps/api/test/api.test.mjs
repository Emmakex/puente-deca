import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "../src/server.mjs";

const validPayload = {
  externalReference: "SHIP-2026-0001",
  contractualShipper: {
    legalName: "Example Shipper SL",
    taxId: "B12345678",
    address: "Calle Ejemplo 1, Madrid"
  },
  effectiveCarrier: {
    legalName: "Example Carrier SL",
    taxId: "B87654321"
  },
  route: {
    origin: "Madrid",
    destination: "Barcelona"
  },
  goods: {
    nature: "Furniture",
    weight: {
      value: 420,
      unit: "kg"
    }
  },
  transport: {
    date: "2026-10-05",
    vehicle: {
      tractorRegistration: "1234ABC",
      trailerRegistration: null
    },
    specialTrafficAuthorization: null
  },
  observations: null
};

const withServer = async (
  fn,
  serverOptions = {}
) => {
  const server = createServer({
    publicBaseUrl: "https://deca.example.com",
    ...serverOptions
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
};

test("GET /health exposes service health", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      status: "ok",
      service: "puente-deca"
    });
  });
});

test("POST /v1/deca/validate returns 422 for incomplete data", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/deca/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.valid, false);
    assert.ok(body.errors.length > 0);
  });
});

test("POST /v1/deca/snapshot returns a canonical prepared document", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/deca/snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload)
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.documentType, "DECA");
    assert.equal(body.version, 1);
    assert.equal(body.state, "prepared");
    assert.match(
      body.accessUrl,
      /^https:\/\/deca\.example\.com\/d\/[^/]+\.pdf$/
    );
    assert.match(body.contentHash, /^sha256:[a-f0-9]{64}$/);
  });
});

test("POST /v1/deca/pdf returns a generated native PDF", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/deca/pdf`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload)
    });
    const pdf = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 201);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.match(
      response.headers.get("x-deca-document-id"),
      /^deca_/
    );
    assert.equal(
      pdf.subarray(0, 8).toString("latin1"),
      "%PDF-1.7"
    );
  });
});

test("PDF endpoint rejects unsupported characters instead of corrupting them", async () => {
  await withServer(async (baseUrl) => {
    const payload = structuredClone(validPayload);
    payload.contractualShipper.legalName = "Łódź Logistics";

    const response = await fetch(`${baseUrl}/v1/deca/pdf`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.error, "unsupported_pdf_character");
    assert.equal(body.character, "Ł");
  });
});


test("GET /ready fails closed when operational stores are not configured", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/ready`
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(
      body.status,
      "not_ready"
    );
  });
});

test("GET /ready hides dependency errors and reports unavailable", async () => {
  const server = createServer({
    store: {
      async probe() {
        throw new Error(
          "mongodb secret host detail"
        );
      }
    },
    artifactStore: {
      async probe() {
        return { ok: true };
      }
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/ready`
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.deepEqual(body, {
      status: "not_ready",
      service: "puente-deca",
      components: {
        metadata: "unavailable",
        artifacts: "ok"
      }
    });
    assert.doesNotMatch(
      JSON.stringify(body),
      /mongodb secret host detail/
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("GET /metrics requires server-to-server authentication", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/metrics`
    );

    assert.equal(response.status, 401);
  });
});


test("standalone DeCA laboratory endpoints are hidden when production surface is enforced", async () => {
  await withServer(
    async (baseUrl) => {
      for (const path of [
        "/v1/deca/validate",
        "/v1/deca/snapshot",
        "/v1/deca/pdf"
      ]) {
        const response = await fetch(
          `${baseUrl}${path}`,
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json"
            },
            body: JSON.stringify(
              validPayload
            )
          }
        );
        const body =
          await response.json();

        assert.equal(
          response.status,
          404
        );
        assert.deepEqual(body, {
          error: "not_found",
          message: "Route not found"
        });
      }
    },
    {
      standaloneToolsEnabled:
        false
    }
  );
});
