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

const withServer = async (fn) => {
  const server = createServer({
    publicBaseUrl: "https://deca.example.com"
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
    assert.match(body.accessUrl, /^https:\/\/deca\.example\.com\/d\/[^/]+\.pdf$/);
    assert.match(body.contentHash, /^sha256:[a-f0-9]{64}$/);
  });
});
