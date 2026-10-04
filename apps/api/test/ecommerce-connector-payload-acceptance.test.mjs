import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createServer } from "../src/server.mjs";
import { JsonStore } from "../../../packages/persistence/src/json-store.mjs";
import { FileArtifactStore } from "../../../packages/persistence/src/file-artifact-store.mjs";
import { connector as wooCommerceConnector } from "../../../connectors/woocommerce/contract.mjs";
import { connector as prestaShopConnector } from "../../../connectors/prestashop/contract.mjs";
import { normalizeDecaRequest } from "../../../packages/core/src/normalize-deca.mjs";
import { validateDecaRequest } from "../../../packages/core/src/validate-deca.mjs";

const PLATFORM_SERVICE_SECRET =
  "kairoseth-cargo-ecommerce-acceptance-0123456789abcdef";

async function loadFixture(name) {
  return JSON.parse(
    await readFile(
      join(
        process.cwd(),
        "examples",
        "connectors",
        `${name}.json`,
      ),
      "utf8",
    ),
  );
}

async function withServer(fn) {
  const directory = await mkdtemp(
    join(tmpdir(), "puente-deca-ecommerce-acceptance-"),
  );

  let sequence = 0;
  const store = await JsonStore.open({
    filePath: join(directory, "store.json"),
    apiKeyFactory: () => {
      sequence += 1;
      return `pdeca_test_connector_${String(sequence).padStart(4, "0")}_abcdefghijklmnop`;
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

function platformHeaders(organizationId) {
  return {
    "content-type": "application/json",
    "x-kairoseth-service-secret": PLATFORM_SERVICE_SECRET,
    "x-kairoseth-organization-id": organizationId,
  };
}

async function issueCredential({
  baseUrl,
  organizationId,
  kind,
}) {
  const headers = platformHeaders(organizationId);

  const lease = await fetch(
    `${baseUrl}/v1/access/connectors`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        validUntil: "2099-01-01T00:00:00.000Z",
      }),
    },
  );
  assert.equal(lease.status, 200);

  const response = await fetch(
    `${baseUrl}/v1/credentials`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: `${kind} internal acceptance`,
        kind,
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.credential.kind, kind);

  return body.apiKey;
}

async function assertConnectorRoundTrip({
  baseUrl,
  organizationId,
  kind,
  connector,
  fixtureName,
  expectedExternalReference,
}) {
  const source = await loadFixture(fixtureName);
  const mapped = connector.mapShipment(source);
  const normalized = normalizeDecaRequest(mapped);
  const validation = validateDecaRequest(normalized);

  assert.equal(
    validation.valid,
    true,
    `${kind} mapped payload must satisfy canonical DeCA validation`,
  );
  assert.equal(
    mapped.externalReference,
    expectedExternalReference,
  );

  const apiKey = await issueCredential({
    baseUrl,
    organizationId,
    kind,
  });

  const createResponse = await fetch(
    `${baseUrl}/v1/shipments`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key":
          `${kind}-acceptance-${mapped.externalReference}`,
        "x-connector-version":
          `${kind}/${connector.version}`,
      },
      body: JSON.stringify(mapped),
    },
  );
  const created = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(
    created.externalReference,
    expectedExternalReference,
  );
  assert.match(created.shipmentId, /^shp_/);

  const readResponse = await fetch(
    `${baseUrl}/v1/shipments/${created.shipmentId}`,
    {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    },
  );
  const stored = await readResponse.json();

  assert.equal(readResponse.status, 200);
  assert.equal(
    stored.externalReference,
    expectedExternalReference,
  );
  assert.equal(
    stored.data.goods.nature,
    mapped.goods.nature,
  );
  assert.equal(
    stored.data.route.destination,
    mapped.route.destination,
  );

  const generateResponse = await fetch(
    `${baseUrl}/v1/shipments/${created.shipmentId}/deca`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
    },
  );
  const generated = await generateResponse.json();

  assert.equal(generateResponse.status, 201);
  assert.equal(generated.document.version, 1);
  assert.match(
    generated.document.accessUrl,
    /^https:\/\/kairoseth\.com\/deca\/d\/.+\.pdf$/,
  );

  return {
    shipmentId: created.shipmentId,
    apiKey,
  };
}

test("WooCommerce fixture maps into a real accepted Cargo shipment and DeCA", async () => {
  await withServer(async ({ baseUrl }) => {
    await assertConnectorRoundTrip({
      baseUrl,
      organizationId: "kairoseth-woo-acceptance",
      kind: "woocommerce",
      connector: wooCommerceConnector,
      fixtureName: "woocommerce",
      expectedExternalReference: "woo:1:order:42001",
    });
  });
});

test("PrestaShop fixture maps into a real accepted Cargo shipment and DeCA", async () => {
  await withServer(async ({ baseUrl }) => {
    await assertConnectorRoundTrip({
      baseUrl,
      organizationId: "kairoseth-prestashop-acceptance",
      kind: "prestashop",
      connector: prestaShopConnector,
      fixtureName: "prestashop",
      expectedExternalReference:
        "prestashop:1:order:4201",
    });
  });
});

test("WooCommerce and PrestaShop mapped references remain distinct and tenant-safe", async () => {
  const woo = wooCommerceConnector.mapShipment(
    await loadFixture("woocommerce"),
  );
  const presta = prestaShopConnector.mapShipment(
    await loadFixture("prestashop"),
  );

  assert.notEqual(
    woo.externalReference,
    presta.externalReference,
  );
  assert.match(
    woo.externalReference,
    /^woo:/,
  );
  assert.match(
    presta.externalReference,
    /^prestashop:/,
  );
});
