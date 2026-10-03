import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.mjs";
import { JsonStore } from "../../../packages/persistence/src/json-store.mjs";
import { FileArtifactStore } from "../../../packages/persistence/src/file-artifact-store.mjs";

const SERVICE_SECRET =
  "kairoseth-e2e-service-secret-0123456789abcdef";

const payload = {
  externalReference: "KS-E2E-0001",
  contractualShipper: {
    legalName: "Łódź Logística Ελληνική SL",
    taxId: "B12345678",
    address: "Carrer d'Àngel Guimerà 1, Sabadell"
  },
  effectiveCarrier: {
    legalName: "Транспорт Núñez SL",
    taxId: "B87654321"
  },
  route: {
    origin: "Sabadell",
    destination: "Barcelona"
  },
  goods: {
    nature: "Mobiliari Việt Nam",
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
  observations: "Manipular amb precaució"
};

const sha256 = (bytes) =>
  `sha256:${createHash("sha256")
    .update(bytes)
    .digest("hex")}`;

const platformHeaders = (
  organizationId,
  extra = {}
) => ({
  "x-kairoseth-service-secret":
    SERVICE_SECRET,
  "x-kairoseth-organization-id":
    organizationId,
  ...extra
});

test("Kairoseth contract E2E: tenant -> shipment -> DeCA -> public PDF -> isolation", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "pdeca-kairoseth-e2e-")
  );

  const store = await JsonStore.open({
    filePath: join(directory, "store.json")
  });

  const artifactStore =
    await FileArtifactStore.open({
      rootDirectory: join(
        directory,
        "documents"
      )
    });

  const server = createServer({
    publicBaseUrl:
      "https://kairoseth.com/deca",
    store,
    artifactStore,
    platformServiceSecret:
      SERVICE_SECRET,
    standaloneToolsEnabled: false
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    const baseUrl =
      `http://127.0.0.1:${address.port}`;

    const ready = await fetch(
      `${baseUrl}/ready`
    );
    const readyBody =
      await ready.json();

    assert.equal(ready.status, 200);
    assert.equal(
      readyBody.status,
      "ready"
    );

    const orgA = "ks-org-e2e-a";
    const orgB = "ks-org-e2e-b";

    const createResponse = await fetch(
      `${baseUrl}/v1/shipments`,
      {
        method: "POST",
        headers: platformHeaders(
          orgA,
          {
            "content-type":
              "application/json",
            "idempotency-key":
              "ks-e2e-shipment-0001"
          }
        ),
        body: JSON.stringify(payload)
      }
    );
    const shipment =
      await createResponse.json();

    assert.equal(
      createResponse.status,
      201
    );
    assert.equal(
      shipment.organizationId,
      orgA
    );
    assert.match(
      shipment.shipmentId,
      /^shp_/
    );

    const generateResponse =
      await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
        {
          method: "POST",
          headers:
            platformHeaders(orgA)
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
    assert.equal(
      generated.reused,
      false
    );

    const publicUrl =
      new URL(
        generated.document.accessUrl
      );

    assert.equal(
      publicUrl.origin,
      "https://kairoseth.com"
    );
    assert.match(
      publicUrl.pathname,
      /^\/deca\/d\/[A-Za-z0-9_-]+\.pdf$/
    );

    const publicResponse =
      await fetch(
        `${baseUrl}${publicUrl.pathname}`
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
    assert.match(
      publicResponse.headers.get(
        "cache-control"
      ) ?? "",
      /no-store/
    );
    assert.equal(
      publicResponse.headers.get(
        "x-content-type-options"
      ),
      "nosniff"
    );
    assert.equal(
      publicResponse.headers.get(
        "referrer-policy"
      ),
      "no-referrer"
    );
    assert.equal(
      pdf.subarray(0, 8)
        .toString("latin1"),
      "%PDF-1.7"
    );
    assert.equal(
      sha256(pdf),
      generated.artifact.sha256
    );

    const metadataResponse =
      await fetch(
        `${baseUrl}/v1/deca/${generated.document.documentId}`,
        {
          headers:
            platformHeaders(orgA)
        }
      );
    const metadata =
      await metadataResponse.json();

    assert.equal(
      metadataResponse.status,
      200
    );
    assert.equal(
      metadata.organizationId,
      orgA
    );
    assert.equal(
      metadata.artifact.sha256,
      generated.artifact.sha256
    );

    const crossTenantShipment =
      await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}`,
        {
          headers:
            platformHeaders(orgB)
        }
      );
    assert.equal(
      crossTenantShipment.status,
      404
    );

    const crossTenantDocument =
      await fetch(
        `${baseUrl}/v1/deca/${generated.document.documentId}`,
        {
          headers:
            platformHeaders(orgB)
        }
      );
    assert.equal(
      crossTenantDocument.status,
      404
    );

    const orgBList = await fetch(
      `${baseUrl}/v1/shipments?limit=10`,
      {
        headers:
          platformHeaders(orgB)
      }
    );
    const orgBListBody =
      await orgBList.json();

    assert.equal(
      orgBList.status,
      200
    );
    assert.equal(
      orgBListBody.total,
      0
    );
    assert.deepEqual(
      orgBListBody.items,
      []
    );

    const repeat = await fetch(
      `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
      {
        method: "POST",
        headers:
          platformHeaders(orgA)
      }
    );
    const repeatBody =
      await repeat.json();

    assert.equal(repeat.status, 200);
    assert.equal(
      repeatBody.reused,
      true
    );
    assert.equal(
      repeatBody.document.documentId,
      generated.document.documentId
    );
  } finally {
    server.close();
    await once(server, "close");

    await rm(directory, {
      recursive: true,
      force: true
    });
  }
});
