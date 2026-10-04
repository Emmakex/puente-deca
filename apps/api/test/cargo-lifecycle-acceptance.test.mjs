import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createServer } from "../src/server.mjs";
import { JsonStore } from "../../../packages/persistence/src/json-store.mjs";
import { FileArtifactStore } from "../../../packages/persistence/src/file-artifact-store.mjs";

const PLATFORM_SERVICE_SECRET =
  "kairoseth-cargo-lifecycle-secret-0123456789abcdef";

const shipmentPayload = {
  externalReference: "CARGO-E2E-0001",
  contractualShipper: {
    legalName: "Kairoseth Cargo Test Shipper SL",
    taxId: "B12345678",
    address: "Calle Prueba 1, Madrid",
  },
  effectiveCarrier: {
    legalName: "Kairoseth Cargo Test Carrier SL",
    taxId: "B87654321",
  },
  route: {
    origin: "Madrid",
    destination: "Barcelona",
  },
  goods: {
    nature: "Furniture",
    weight: {
      value: 420,
      unit: "kg",
    },
  },
  transport: {
    date: "2026-10-05",
    vehicle: {
      tractorRegistration: "1234ABC",
      trailerRegistration: null,
    },
    specialTrafficAuthorization: null,
  },
  observations: "Internal Cargo lifecycle acceptance",
};

async function withLifecycleServer(fn) {
  const directory = await mkdtemp(
    join(tmpdir(), "puente-deca-cargo-lifecycle-"),
  );

  let apiKeySequence = 0;
  const store = await JsonStore.open({
    filePath: join(directory, "store.json"),
    apiKeyFactory: () => {
      apiKeySequence += 1;
      return `pdeca_test_lifecycle_${String(apiKeySequence).padStart(4, "0")}_abcdefghijklmnop`;
    },
  });

  const artifactStore = await FileArtifactStore.open({
    rootDirectory: join(directory, "documents"),
  });

  const server = createServer({
    publicBaseUrl: "https://kairoseth.com/deca",
    store,
    artifactStore,
    platformServiceSecret: PLATFORM_SERVICE_SECRET,
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    await fn({
      baseUrl: `http://127.0.0.1:${address.port}`,
      store,
    });
  } finally {
    server.close();
    await once(server, "close");
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
}

function serviceHeaders(organizationId) {
  return {
    "content-type": "application/json",
    "x-kairoseth-service-secret": PLATFORM_SERVICE_SECRET,
    "x-kairoseth-organization-id": organizationId,
  };
}

function bearerHeaders(apiKey) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

test("Kairoseth Cargo internal lifecycle: paid connector -> shipment -> DeCA -> expiry -> restore -> revoke", async () => {
  await withLifecycleServer(async ({ baseUrl }) => {
    const organizationId = "kairoseth-cargo-lifecycle-org";
    const platformHeaders = serviceHeaders(organizationId);

    const activateLease = await fetch(
      `${baseUrl}/v1/access/connectors`,
      {
        method: "PUT",
        headers: platformHeaders,
        body: JSON.stringify({
          validUntil: "2099-01-01T00:00:00.000Z",
        }),
      },
    );
    assert.equal(activateLease.status, 200);

    const credentialResponse = await fetch(
      `${baseUrl}/v1/credentials`,
      {
        method: "POST",
        headers: platformHeaders,
        body: JSON.stringify({
          name: "WooCommerce internal acceptance",
          kind: "woocommerce",
          expiresAt: "2099-01-01T00:00:00.000Z",
        }),
      },
    );
    const credentialBody = await credentialResponse.json();

    assert.equal(credentialResponse.status, 201);
    assert.equal(
      credentialBody.credential.kind,
      "woocommerce",
    );
    assert.equal(
      credentialBody.credential.expiresAt,
      "2099-01-01T00:00:00.000Z",
    );
    assert.match(
      credentialBody.apiKey,
      /^pdeca_test_lifecycle_/,
    );

    const createShipment = await fetch(
      `${baseUrl}/v1/shipments`,
      {
        method: "POST",
        headers: {
          ...bearerHeaders(credentialBody.apiKey),
          "idempotency-key": "cargo-e2e-order-0001",
        },
        body: JSON.stringify(shipmentPayload),
      },
    );
    const shipment = await createShipment.json();

    assert.equal(createShipment.status, 201);
    assert.match(shipment.shipmentId, /^shp_/);

    const replayShipment = await fetch(
      `${baseUrl}/v1/shipments`,
      {
        method: "POST",
        headers: {
          ...bearerHeaders(credentialBody.apiKey),
          "idempotency-key": "cargo-e2e-order-0001",
        },
        body: JSON.stringify(shipmentPayload),
      },
    );
    const replay = await replayShipment.json();

    assert.equal(replayShipment.status, 200);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.shipmentId, shipment.shipmentId);

    const generate = await fetch(
      `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
      {
        method: "POST",
        headers: bearerHeaders(credentialBody.apiKey),
      },
    );
    const generated = await generate.json();

    assert.equal(generate.status, 201);
    assert.equal(generated.document.version, 1);
    assert.equal(generated.reused, false);
    assert.match(
      generated.document.accessUrl,
      /^https:\/\/kairoseth\.com\/deca\/d\/.+\.pdf$/,
    );

    const publicPath = new URL(
      generated.document.accessUrl,
    ).pathname;
    const publicPdf = await fetch(
      `${baseUrl}${publicPath}`,
    );
    const pdfBytes = Buffer.from(
      await publicPdf.arrayBuffer(),
    );

    assert.equal(publicPdf.status, 200);
    assert.equal(
      publicPdf.headers.get("content-type"),
      "application/pdf",
    );
    assert.equal(
      pdfBytes.subarray(0, 8).toString("latin1"),
      "%PDF-1.7",
    );

    const usage = await fetch(
      `${baseUrl}/v1/usage/documents?from=2026-10-01T00%3A00%3A00.000Z&to=2026-11-01T00%3A00%3A00.000Z`,
      {
        headers: platformHeaders,
      },
    );
    const usageBody = await usage.json();

    assert.equal(usage.status, 200);
    assert.equal(usageBody.documents, 1);
    assert.equal(usageBody.organizationId, organizationId);

    const expireCredential = await fetch(
      `${baseUrl}/v1/credentials`,
      {
        method: "PATCH",
        headers: platformHeaders,
        body: JSON.stringify({
          expiresAt: "2000-01-01T00:00:00.000Z",
        }),
      },
    );
    const expiredCredentialBody =
      await expireCredential.json();

    assert.equal(expireCredential.status, 200);
    assert.equal(expiredCredentialBody.updated, 1);

    const deniedByCredentialExpiry = await fetch(
      `${baseUrl}/v1/shipments`,
      {
        headers: {
          authorization: `Bearer ${credentialBody.apiKey}`,
        },
      },
    );
    assert.equal(deniedByCredentialExpiry.status, 401);

    const restoreCredential = await fetch(
      `${baseUrl}/v1/credentials`,
      {
        method: "PATCH",
        headers: platformHeaders,
        body: JSON.stringify({
          expiresAt: "2099-01-01T00:00:00.000Z",
        }),
      },
    );
    assert.equal(restoreCredential.status, 200);

    const restoredAfterCredentialExpiry = await fetch(
      `${baseUrl}/v1/shipments`,
      {
        headers: {
          authorization: `Bearer ${credentialBody.apiKey}`,
        },
      },
    );
    assert.equal(restoredAfterCredentialExpiry.status, 200);

    const expireLease = await fetch(
      `${baseUrl}/v1/access/connectors`,
      {
        method: "PUT",
        headers: platformHeaders,
        body: JSON.stringify({
          validUntil: "2000-01-01T00:00:00.000Z",
        }),
      },
    );
    assert.equal(expireLease.status, 200);

    const deniedByLeaseExpiry = await fetch(
      `${baseUrl}/v1/shipments`,
      {
        headers: {
          authorization: `Bearer ${credentialBody.apiKey}`,
        },
      },
    );
    assert.equal(deniedByLeaseExpiry.status, 401);

    const restoreLease = await fetch(
      `${baseUrl}/v1/access/connectors`,
      {
        method: "PUT",
        headers: platformHeaders,
        body: JSON.stringify({
          validUntil: "2099-01-01T00:00:00.000Z",
        }),
      },
    );
    assert.equal(restoreLease.status, 200);

    const restoredAfterLeaseExpiry = await fetch(
      `${baseUrl}/v1/shipments`,
      {
        headers: {
          authorization: `Bearer ${credentialBody.apiKey}`,
        },
      },
    );
    assert.equal(restoredAfterLeaseExpiry.status, 200);

    const revoke = await fetch(
      `${baseUrl}/v1/credentials/${credentialBody.credential.credentialId}`,
      {
        method: "DELETE",
        headers: platformHeaders,
      },
    );
    const revokedBody = await revoke.json();

    assert.equal(revoke.status, 200);
    assert.ok(revokedBody.credential.revokedAt);

    const deniedAfterRevocation = await fetch(
      `${baseUrl}/v1/shipments`,
      {
        headers: {
          authorization: `Bearer ${credentialBody.apiKey}`,
        },
      },
    );
    assert.equal(deniedAfterRevocation.status, 401);
  });
});

test("Kairoseth Cargo internal lifecycle: tenant and service boundaries stay isolated", async () => {
  await withLifecycleServer(async ({ baseUrl }) => {
    const firstOrganizationId = "kairoseth-cargo-org-a";
    const secondOrganizationId = "kairoseth-cargo-org-b";

    for (const organizationId of [
      firstOrganizationId,
      secondOrganizationId,
    ]) {
      const lease = await fetch(
        `${baseUrl}/v1/access/connectors`,
        {
          method: "PUT",
          headers: serviceHeaders(organizationId),
          body: JSON.stringify({
            validUntil: "2099-01-01T00:00:00.000Z",
          }),
        },
      );
      assert.equal(lease.status, 200);
    }

    const firstCredentialResponse = await fetch(
      `${baseUrl}/v1/credentials`,
      {
        method: "POST",
        headers: serviceHeaders(firstOrganizationId),
        body: JSON.stringify({
          name: "API integration A",
          kind: "api",
        }),
      },
    );
    const firstCredential =
      await firstCredentialResponse.json();
    assert.equal(firstCredentialResponse.status, 201);

    const shipmentResponse = await fetch(
      `${baseUrl}/v1/shipments`,
      {
        method: "POST",
        headers: {
          ...bearerHeaders(firstCredential.apiKey),
          "idempotency-key": "tenant-a-shipment",
        },
        body: JSON.stringify({
          ...shipmentPayload,
          externalReference: "TENANT-A-0001",
        }),
      },
    );
    assert.equal(shipmentResponse.status, 201);

    const secondList = await fetch(
      `${baseUrl}/v1/shipments`,
      {
        headers: serviceHeaders(secondOrganizationId),
      },
    );
    const secondBody = await secondList.json();

    assert.equal(secondList.status, 200);
    assert.equal(secondBody.total, 0);

    const crossTenantRevoke = await fetch(
      `${baseUrl}/v1/credentials/${firstCredential.credential.credentialId}`,
      {
        method: "DELETE",
        headers: serviceHeaders(secondOrganizationId),
      },
    );
    assert.equal(crossTenantRevoke.status, 404);

    const stillValid = await fetch(
      `${baseUrl}/v1/shipments`,
      {
        headers: {
          authorization: `Bearer ${firstCredential.apiKey}`,
        },
      },
    );
    assert.equal(stillValid.status, 200);

    const connectorCannotUsePlatformCredentialRoute = await fetch(
      `${baseUrl}/v1/credentials`,
      {
        method: "POST",
        headers: bearerHeaders(firstCredential.apiKey),
        body: JSON.stringify({
          name: "forbidden child credential",
          kind: "api",
        }),
      },
    );
    assert.equal(
      connectorCannotUsePlatformCredentialRoute.status,
      401,
    );
  });
});
