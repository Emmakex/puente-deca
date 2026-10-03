import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.mjs";
import { JsonStore } from "../../../packages/persistence/src/json-store.mjs";
import { FileArtifactStore } from "../../../packages/persistence/src/file-artifact-store.mjs";

const shipmentPayload = {
  externalReference: "SHIP-2026-0042",
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

const withOperationalServer = async (fn) => {
  const directory = await mkdtemp(
    join(tmpdir(), "puente-deca-api-")
  );

  const store = await JsonStore.open({
    filePath: join(directory, "state.json")
  });
  const artifactStore = await FileArtifactStore.open({
    rootDirectory: join(directory, "artifacts")
  });

  const organization = await store.createOrganization({
    name: "Test Organization"
  });

  const { apiKey } = await store.createApiCredential({
    organizationId: organization.organizationId,
    name: "test"
  });

  const server = createServer({
    publicBaseUrl: "https://deca.example.com",
    store,
    artifactStore
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    await fn({
      baseUrl: `http://127.0.0.1:${address.port}`,
      apiKey,
      organization,
      store
    });
  } finally {
    server.close();
    await once(server, "close");
    await rm(directory, {
      recursive: true,
      force: true
    });
  }
};

const authHeaders = (apiKey, extra = {}) => ({
  authorization: `Bearer ${apiKey}`,
  "content-type": "application/json",
  ...extra
});

test("operational endpoints require an API key", async () => {
  await withOperationalServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/v1/shipments`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(shipmentPayload)
    });

    assert.equal(response.status, 401);
    assert.equal(
      response.headers.get("www-authenticate"),
      "Bearer"
    );
  });
});

test("creates a shipment, persists DeCA and serves its public PDF URL", async () => {
  await withOperationalServer(
    async ({ baseUrl, apiKey }) => {
      const createResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers: authHeaders(apiKey, {
            "idempotency-key": "shipment-42"
          }),
          body: JSON.stringify(shipmentPayload)
        }
      );

      assert.equal(createResponse.status, 201);
      const shipment = await createResponse.json();
      assert.match(shipment.shipmentId, /^shp_/);

      const replayResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers: authHeaders(apiKey, {
            "idempotency-key": "shipment-42"
          }),
          body: JSON.stringify(shipmentPayload)
        }
      );

      assert.equal(replayResponse.status, 200);
      const replay = await replayResponse.json();
      assert.equal(replay.shipmentId, shipment.shipmentId);
      assert.equal(replay.idempotentReplay, true);

      const generateResponse = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
        {
          method: "POST",
          headers: authHeaders(apiKey),
          body: "{}"
        }
      );

      assert.equal(generateResponse.status, 201);
      const document = await generateResponse.json();
      assert.match(document.documentId, /^deca_/);
      assert.equal(document.version, 1);
      assert.equal(document.reused, false);
      assert.match(
        document.snapshot.accessUrl,
        /^https:\/\/deca\.example\.com\/d\//
      );
      assert.match(
        document.artifact.sha256,
        /^sha256:[a-f0-9]{64}$/
      );
      assert.equal(
        document.artifact.minimumRetainUntil,
        "2027-10-05T00:00:00.000Z"
      );

      const repeatGenerate = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
        {
          method: "POST",
          headers: authHeaders(apiKey),
          body: "{}"
        }
      );

      assert.equal(repeatGenerate.status, 200);
      const repeated = await repeatGenerate.json();
      assert.equal(repeated.documentId, document.documentId);
      assert.equal(repeated.reused, true);

      const metadataResponse = await fetch(
        `${baseUrl}/v1/deca/${document.documentId}`,
        {
          headers: {
            authorization: `Bearer ${apiKey}`
          }
        }
      );

      assert.equal(metadataResponse.status, 200);
      const metadata = await metadataResponse.json();
      assert.equal(metadata.documentId, document.documentId);

      const authenticatedPdfResponse = await fetch(
        `${baseUrl}/v1/deca/${document.documentId}.pdf`,
        {
          headers: {
            authorization: `Bearer ${apiKey}`
          }
        }
      );

      assert.equal(authenticatedPdfResponse.status, 200);
      const authenticatedPdf = Buffer.from(
        await authenticatedPdfResponse.arrayBuffer()
      );
      assert.equal(
        authenticatedPdf.subarray(0, 8).toString("latin1"),
        "%PDF-1.7"
      );

      const publicPath = new URL(
        document.snapshot.accessUrl
      ).pathname;
      const publicResponse = await fetch(
        `${baseUrl}${publicPath}`
      );

      assert.equal(publicResponse.status, 200);
      assert.match(
        publicResponse.headers.get("content-disposition"),
        /^attachment;/
      );
      const publicPdf = Buffer.from(
        await publicResponse.arrayBuffer()
      );
      assert.equal(
        publicPdf.subarray(0, 8).toString("latin1"),
        "%PDF-1.7"
      );

      const shipmentResponse = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}`,
        {
          headers: {
            authorization: `Bearer ${apiKey}`
          }
        }
      );

      assert.equal(shipmentResponse.status, 200);
      const storedShipment = await shipmentResponse.json();
      assert.deepEqual(
        storedShipment.documentVersionIds,
        [document.documentId]
      );
    }
  );
});
