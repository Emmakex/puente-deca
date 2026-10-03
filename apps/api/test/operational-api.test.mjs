import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.mjs";
import {
  JsonStore
} from "../../../packages/persistence/src/json-store.mjs";
import {
  FileArtifactStore
} from "../../../packages/persistence/src/file-artifact-store.mjs";

const payload = {
  externalReference: "SHIP-2026-0100",
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

const PLATFORM_SERVICE_SECRET =
  "kairoseth-ci-service-secret-0123456789abcdef";

const withOperationalServer = async (fn) => {
  const directory = await mkdtemp(
    join(tmpdir(), "puente-deca-api-")
  );
  let apiKeySequence = 0;
  const store = await JsonStore.open({
    filePath: join(
      directory,
      "store.json"
    ),
    apiKeyFactory: () => {
      apiKeySequence += 1;
      return `pdeca_test_operational_${String(
        apiKeySequence
      ).padStart(4, "0")}_abcdefghijklmnop`;
    }
  });
  const artifactStore =
    await FileArtifactStore.open({
      rootDirectory: join(
        directory,
        "documents"
      )
    });

  const organization =
    await store.createOrganization({
      name: "Organization 001"
    });
  const createdCredential =
    await store.createApiCredential({
      organizationId:
        organization.organizationId,
      name: "integration test"
    });

  const server = createServer({
    publicBaseUrl:
      "https://deca.example.com/public",
    store,
    artifactStore,
    platformServiceSecret:
      PLATFORM_SERVICE_SECRET
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    await fn({
      baseUrl:
        `http://127.0.0.1:${address.port}`,
      apiKey: createdCredential.apiKey,
      organization,
      store,
      platformServiceSecret:
        PLATFORM_SERVICE_SECRET
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

const authHeaders = (apiKey) => ({
  authorization: `Bearer ${apiKey}`,
  "content-type": "application/json"
});

test("operational flow stores a DeCA and exposes its prefixed QR URL directly", async () => {
  await withOperationalServer(
    async ({ baseUrl, apiKey, store, organization }) => {
      const createResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers: {
            ...authHeaders(apiKey),
            "idempotency-key":
              "order-2026-0100"
          },
          body: JSON.stringify(payload)
        }
      );
      const shipment =
        await createResponse.json();

      assert.equal(
        createResponse.status,
        201
      );
      assert.match(
        shipment.shipmentId,
        /^shp_/
      );

      const replayResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers: {
            ...authHeaders(apiKey),
            "idempotency-key":
              "order-2026-0100"
          },
          body: JSON.stringify(payload)
        }
      );
      const replay =
        await replayResponse.json();

      assert.equal(replayResponse.status, 200);
      assert.equal(
        replay.shipmentId,
        shipment.shipmentId
      );
      assert.equal(
        replay.idempotentReplay,
        true
      );

      const generateResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
          {
            method: "POST",
            headers: authHeaders(apiKey)
          }
        );
      const generated =
        await generateResponse.json();

      assert.equal(
        generateResponse.status,
        201
      );
      assert.equal(
        generated.document.version,
        1
      );
      assert.equal(generated.reused, false);
      assert.match(
        generated.artifact.sha256,
        /^sha256:[a-f0-9]{64}$/
      );
      assert.equal(
        generated.artifact.retentionNotBefore,
        "2027-10-05T00:00:00.000Z"
      );

      const repeatedGeneration =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
          {
            method: "POST",
            headers: authHeaders(apiKey)
          }
        );
      const repeated =
        await repeatedGeneration.json();

      assert.equal(
        repeatedGeneration.status,
        200
      );
      assert.equal(repeated.reused, true);
      assert.equal(
        repeated.document.documentId,
        generated.document.documentId
      );

      const accessPath =
        new URL(
          generated.document.accessUrl
        ).pathname;

      assert.match(
        accessPath,
        /^\/public\/d\//
      );

      const publicResponse = await fetch(
        `${baseUrl}${accessPath}`
      );
      const pdf = Buffer.from(
        await publicResponse.arrayBuffer()
      );

      assert.equal(
        publicResponse.status,
        200
      );
      assert.equal(
        publicResponse.headers.get(
          "content-type"
        ),
        "application/pdf"
      );
      assert.equal(
        pdf.subarray(0, 8).toString(
          "latin1"
        ),
        "%PDF-1.7"
      );

      const metadataResponse =
        await fetch(
          `${baseUrl}/v1/deca/${generated.document.documentId}`,
          {
            headers: {
              authorization:
                `Bearer ${apiKey}`
            }
          }
        );
      const metadata =
        await metadataResponse.json();

      assert.equal(
        metadataResponse.status,
        200
      );
      assert.equal(
        metadata.artifact.sha256,
        generated.artifact.sha256
      );

      const shipmentResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}`,
          {
            headers: {
              authorization:
                `Bearer ${apiKey}`
            }
          }
        );

      assert.equal(
        shipmentResponse.status,
        200
      );

      const storedShipment =
        await shipmentResponse.json();
      assert.deepEqual(
        storedShipment.documentVersionIds,
        [generated.document.documentId]
      );

      const events =
        await store.listAuditEvents({
          organizationId:
            organization.organizationId,
          shipmentId:
            shipment.shipmentId
        });

      assert.deepEqual(
        events.map(
          (event) => event.type
        ),
        [
          "shipment.created",
          "document.version.created"
        ]
      );
    }
  );
});

test("operational routes reject missing API credentials", async () => {
  await withOperationalServer(
    async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      assert.equal(response.status, 401);
    }
  );
});


test("updates a shipment and generates a linked DeCA revision", async () => {
  await withOperationalServer(
    async ({ baseUrl, apiKey, store, organization }) => {
      const createResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers: {
            ...authHeaders(apiKey),
            "idempotency-key":
              "order-update-001"
          },
          body: JSON.stringify(payload)
        }
      );
      const shipment =
        await createResponse.json();

      const firstResponse = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
        {
          method: "POST",
          headers: authHeaders(apiKey)
        }
      );
      const first =
        await firstResponse.json();

      assert.equal(firstResponse.status, 201);
      assert.equal(first.document.version, 1);

      const changedPayload =
        structuredClone(payload);
      changedPayload.route.destination =
        "Sabadell";
      changedPayload.transport.vehicle
        .tractorRegistration = "9999ZZZ";

      const updateResponse = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}`,
        {
          method: "PUT",
          headers: authHeaders(apiKey),
          body: JSON.stringify(
            changedPayload
          )
        }
      );
      const updated =
        await updateResponse.json();

      assert.equal(updateResponse.status, 200);
      assert.equal(updated.changed, true);
      assert.equal(
        updated.data.route.destination,
        "Sabadell"
      );

      const secondResponse = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
        {
          method: "POST",
          headers: authHeaders(apiKey)
        }
      );
      const second =
        await secondResponse.json();

      assert.equal(secondResponse.status, 201);
      assert.equal(second.document.version, 2);
      assert.equal(
        second.document.previousVersionId,
        first.document.documentId
      );
      assert.notEqual(
        second.document.contentHash,
        first.document.contentHash
      );

      const events =
        await store.listAuditEvents({
          organizationId:
            organization.organizationId,
          shipmentId:
            shipment.shipmentId
        });

      assert.deepEqual(
        events.map((event) => event.type),
        [
          "shipment.created",
          "document.version.created",
          "shipment.updated",
          "document.version.created"
        ]
      );
    }
  );
});


test("Kairoseth service auth lazily provisions and lists an isolated organization", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      platformServiceSecret,
      store
    }) => {
      const organizationId =
        "kairoseth-org-001";
      const headers = {
        "content-type": "application/json",
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organizationId,
        "idempotency-key":
          "platform-shipment-001"
      };

      const createdResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        }
      );
      const created =
        await createdResponse.json();

      assert.equal(createdResponse.status, 201);
      assert.equal(
        created.organizationId,
        organizationId
      );

      const organization =
        await store.getOrganization(
          organizationId
        );
      assert.equal(
        organization.externalReference,
        organizationId
      );

      const listResponse = await fetch(
        `${baseUrl}/v1/shipments?limit=10`,
        {
          headers: {
            "x-kairoseth-service-secret":
              platformServiceSecret,
            "x-kairoseth-organization-id":
              organizationId
          }
        }
      );
      const list =
        await listResponse.json();

      assert.equal(listResponse.status, 200);
      assert.equal(list.total, 1);
      assert.equal(list.items.length, 1);
      assert.equal(
        list.items[0].shipmentId,
        created.shipmentId
      );

      const otherResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            "x-kairoseth-service-secret":
              platformServiceSecret,
            "x-kairoseth-organization-id":
              "kairoseth-org-002"
          }
        }
      );
      const other =
        await otherResponse.json();

      assert.equal(otherResponse.status, 200);
      assert.equal(other.total, 0);
      assert.deepEqual(other.items, []);
    }
  );
});

test("Kairoseth service auth rejects an invalid shared secret", async () => {
  await withOperationalServer(
    async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            "x-kairoseth-service-secret":
              "invalid-service-secret",
            "x-kairoseth-organization-id":
              "kairoseth-org-001"
          }
        }
      );

      assert.equal(response.status, 401);
    }
  );
});


test("Kairoseth manages connector credentials with one-time secret reveal", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      platformServiceSecret
    }) => {
      const organizationId =
        "kairoseth-org-credentials";
      const serviceHeaders = {
        "content-type": "application/json",
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organizationId
      };

      const createResponse = await fetch(
        `${baseUrl}/v1/credentials`,
        {
          method: "POST",
          headers: serviceHeaders,
          body: JSON.stringify({
            name: "WooCommerce production"
          })
        }
      );
      const created =
        await createResponse.json();

      assert.equal(createResponse.status, 201);
      assert.match(
        created.apiKey,
        /^pdeca_test_operational_/
      );
      assert.equal(
        created.credential.name,
        "WooCommerce production"
      );
      assert.equal(
        Object.hasOwn(
          created.credential,
          "keyHash"
        ),
        false
      );

      const listResponse = await fetch(
        `${baseUrl}/v1/credentials`,
        {
          headers: {
            "x-kairoseth-service-secret":
              platformServiceSecret,
            "x-kairoseth-organization-id":
              organizationId
          }
        }
      );
      const listed =
        await listResponse.json();

      assert.equal(listResponse.status, 200);
      assert.equal(listed.items.length, 1);
      assert.equal(
        Object.hasOwn(
          listed.items[0],
          "apiKey"
        ),
        false
      );

      const connectorResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            authorization:
              `Bearer ${created.apiKey}`
          }
        }
      );
      assert.equal(
        connectorResponse.status,
        200
      );

      const connectorCannotMint =
        await fetch(
          `${baseUrl}/v1/credentials`,
          {
            method: "POST",
            headers: {
              authorization:
                `Bearer ${created.apiKey}`,
              "content-type":
                "application/json"
            },
            body: JSON.stringify({
              name: "forbidden"
            })
          }
        );
      assert.equal(
        connectorCannotMint.status,
        401
      );

      const revokeResponse = await fetch(
        `${baseUrl}/v1/credentials/${created.credential.credentialId}`,
        {
          method: "DELETE",
          headers: {
            "x-kairoseth-service-secret":
              platformServiceSecret,
            "x-kairoseth-organization-id":
              organizationId
          }
        }
      );
      const revoked =
        await revokeResponse.json();

      assert.equal(revokeResponse.status, 200);
      assert.ok(
        revoked.credential.revokedAt
      );

      const rejectedAfterRevocation =
        await fetch(
          `${baseUrl}/v1/shipments`,
          {
            headers: {
              authorization:
                `Bearer ${created.apiKey}`
            }
          }
        );
      assert.equal(
        rejectedAfterRevocation.status,
        401
      );
    }
  );
});

test("credential API rejects unsupported scopes", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      platformServiceSecret
    }) => {
      const response = await fetch(
        `${baseUrl}/v1/credentials`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-kairoseth-service-secret":
              platformServiceSecret,
            "x-kairoseth-organization-id":
              "kairoseth-org-scope-test"
          },
          body: JSON.stringify({
            name: "Bad scope",
            scopes: ["admin:everything"]
          })
        }
      );

      assert.equal(response.status, 422);
    }
  );
});
