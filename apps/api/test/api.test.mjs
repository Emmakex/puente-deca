import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "../src/server.mjs";

const withServer = async (fn) => {
  const server = createServer();
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
