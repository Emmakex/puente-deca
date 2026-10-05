import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.mjs";
import { createFixedWindowRateLimiter } from "../src/rate-limit.mjs";
import { JsonStore } from "../../../packages/persistence/src/json-store.mjs";
import { FileArtifactStore } from "../../../packages/persistence/src/file-artifact-store.mjs";

const SERVICE_SECRET =
  "internal-security-service-secret-0123456789abcdef";

const shipmentPayload = {
  externalReference: "INTERNAL-SECURITY-QA-0001",
  contractualShipper: {
    legalName: "Kairoseth Cargo Internal Security QA SL",
    taxId: "B00000001",
    address: "Synthetic QA origin"
  },
  effectiveCarrier: {
    legalName: "Kairoseth Cargo Internal Carrier QA SL",
    taxId: "B00000002"
  },
  route: {
    origin: "Barcelona QA",
    destination: "Madrid QA"
  },
  goods: {
    nature: "Synthetic security fixture",
    weight: {
      value: 100,
      unit: "kg"
    }
  },
  transport: {
    date: "2026-10-05",
    vehicle: {
      tractorRegistration: "0000QAQ",
      trailerRegistration: null
    },
    specialTrafficAuthorization: null
  },
  observations: "Synthetic internal security acceptance fixture"
};

const platformHeaders = (
  organizationId,
  extra = {}
) => ({
  "x-kairoseth-service-secret": SERVICE_SECRET,
  "x-kairoseth-organization-id": organizationId,
  ...extra
});

const securityHeadersArePresent = (response) => {
  assert.match(
    response.headers.get("cache-control") ?? "",
    /no-store/i
  );
  assert.equal(
    response.headers.get("x-content-type-options"),
    "nosniff"
  );
  assert.equal(
    response.headers.get("referrer-policy"),
    "no-referrer"
  );
};

const openHarness = async ({ rateLimiter = undefined } = {}) => {
  const directory = await mkdtemp(
    join(tmpdir(), "pdeca-internal-security-")
  );
  const store = await JsonStore.open({
    filePath: join(directory, "store.json")
  });
  const artifactStore = await FileArtifactStore.open({
    rootDirectory: join(directory, "documents")
  });
  const server = createServer({
    publicBaseUrl: "https://kairoseth.com/deca",
    store,
    artifactStore,
    platformServiceSecret: SERVICE_SECRET,
    standaloneToolsEnabled: false,
    ...(rateLimiter ? { rateLimiter } : {})
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    store,
    artifactStore,
    server,
    baseUrl,
    async close() {
      server.close();
      await once(server, "close");
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  };
};

test("internal security: platform authentication fails closed and lab routes stay hidden", async () => {
  const harness = await openHarness();

  try {
    const noAuth = await fetch(
      `${harness.baseUrl}/v1/shipments?limit=1`
    );
    assert.equal(noAuth.status, 401);
    securityHeadersArePresent(noAuth);

    const wrongSecret = await fetch(
      `${harness.baseUrl}/v1/shipments?limit=1`,
      {
        headers: {
          "x-kairoseth-service-secret":
            "wrong-internal-security-secret-0123456789abcdef",
          "x-kairoseth-organization-id": "security-org-a"
        }
      }
    );
    assert.equal(wrongSecret.status, 401);
    securityHeadersArePresent(wrongSecret);

    const missingOrganization = await fetch(
      `${harness.baseUrl}/v1/shipments?limit=1`,
      {
        headers: {
          "x-kairoseth-service-secret": SERVICE_SECRET
        }
      }
    );
    assert.equal(missingOrganization.status, 401);

    const invalidUserContext = await fetch(
      `${harness.baseUrl}/v1/shipments?limit=1`,
      {
        headers: platformHeaders("security-org-a", {
          "x-kairoseth-user-id": "invalid user context"
        })
      }
    );
    assert.equal(invalidUserContext.status, 401);

    for (const path of [
      "/v1/deca/validate",
      "/v1/deca/snapshot",
      "/v1/deca/pdf"
    ]) {
      const response = await fetch(
        `${harness.baseUrl}${path}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: "{}"
        }
      );
      assert.equal(response.status, 404);
      securityHeadersArePresent(response);
    }
  } finally {
    await harness.close();
  }
});

test("internal security: connector credentials cannot administer credentials and revocation is immediate", async () => {
  const harness = await openHarness();
  const organizationId = "security-credential-org";

  try {
    const validUntil = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    const enableAccess = await fetch(
      `${harness.baseUrl}/v1/access/connectors`,
      {
        method: "PUT",
        headers: platformHeaders(organizationId, {
          "content-type": "application/json"
        }),
        body: JSON.stringify({ validUntil })
      }
    );
    assert.equal(enableAccess.status, 200);

    const issue = await fetch(
      `${harness.baseUrl}/v1/credentials`,
      {
        method: "POST",
        headers: platformHeaders(organizationId, {
          "content-type": "application/json"
        }),
        body: JSON.stringify({
          name: "Internal security acceptance connector",
          kind: "api",
          expiresAt: validUntil
        })
      }
    );
    const issued = await issue.json();
    assert.equal(issue.status, 201);
    assert.match(issued.apiKey, /^pdeca_/);
    assert.equal(
      typeof issued.credential?.credentialId,
      "string"
    );

    const bearerHeaders = {
      authorization: `Bearer ${issued.apiKey}`
    };

    const connectorRead = await fetch(
      `${harness.baseUrl}/v1/shipments?limit=1`,
      { headers: bearerHeaders }
    );
    assert.equal(connectorRead.status, 200);

    const forbiddenAdmin = await fetch(
      `${harness.baseUrl}/v1/credentials`,
      {
        method: "POST",
        headers: {
          ...bearerHeaders,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "Privilege escalation attempt",
          kind: "api"
        })
      }
    );
    assert.equal(forbiddenAdmin.status, 401);

    const revoke = await fetch(
      `${harness.baseUrl}/v1/credentials/${encodeURIComponent(
        issued.credential.credentialId
      )}`,
      {
        method: "DELETE",
        headers: platformHeaders(organizationId)
      }
    );
    assert.equal(revoke.status, 200);

    const revokedRead = await fetch(
      `${harness.baseUrl}/v1/shipments?limit=1`,
      { headers: bearerHeaders }
    );
    assert.equal(revokedRead.status, 401);
  } finally {
    await harness.close();
  }
});

test("internal security: tenant isolation and public document tokens resist direct-object probing", async () => {
  const harness = await openHarness();
  const orgA = "security-tenant-a";
  const orgB = "security-tenant-b";

  try {
    const create = await fetch(
      `${harness.baseUrl}/v1/shipments`,
      {
        method: "POST",
        headers: platformHeaders(orgA, {
          "content-type": "application/json",
          "idempotency-key": "security-shipment-0001"
        }),
        body: JSON.stringify(shipmentPayload)
      }
    );
    const shipment = await create.json();
    assert.equal(create.status, 201);

    const generate = await fetch(
      `${harness.baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
      {
        method: "POST",
        headers: platformHeaders(orgA)
      }
    );
    const generated = await generate.json();
    assert.equal(generate.status, 201);

    const crossTenantShipment = await fetch(
      `${harness.baseUrl}/v1/shipments/${shipment.shipmentId}`,
      {
        headers: platformHeaders(orgB)
      }
    );
    assert.equal(crossTenantShipment.status, 404);

    const crossTenantDocument = await fetch(
      `${harness.baseUrl}/v1/deca/${generated.document.documentId}`,
      {
        headers: platformHeaders(orgB)
      }
    );
    assert.equal(crossTenantDocument.status, 404);

    const privateDocumentWithoutAuth = await fetch(
      `${harness.baseUrl}/v1/deca/${generated.document.documentId}`
    );
    assert.equal(privateDocumentWithoutAuth.status, 401);

    const publicPath = new URL(
      generated.document.accessUrl
    ).pathname;
    assert.ok(!publicPath.includes(shipment.shipmentId));
    assert.ok(!publicPath.includes(generated.document.documentId));

    const publicPdf = await fetch(
      `${harness.baseUrl}${publicPath}`
    );
    assert.equal(publicPdf.status, 200);
    assert.equal(
      publicPdf.headers.get("content-type"),
      "application/pdf"
    );
    securityHeadersArePresent(publicPdf);

    const token = publicPath
      .split("/")
      .at(-1)
      .replace(/\.pdf$/, "");
    const first = token[0] === "A" ? "B" : "A";
    const tamperedPath =
      `/deca/d/${first}${token.slice(1)}.pdf`;

    const tampered = await fetch(
      `${harness.baseUrl}${tamperedPath}`
    );
    assert.equal(tampered.status, 404);
    securityHeadersArePresent(tampered);

    const traversalProbe = await fetch(
      `${harness.baseUrl}/deca/d/%2e%2e%2fprivate.pdf`
    );
    assert.equal(traversalProbe.status, 404);
  } finally {
    await harness.close();
  }
});

test("internal security: oversized JSON bodies fail with 413 before mutation", async () => {
  const harness = await openHarness();

  try {
    const oversized = JSON.stringify({
      junk: "x".repeat(1024 * 1024 + 4096)
    });

    const response = await fetch(
      `${harness.baseUrl}/v1/shipments`,
      {
        method: "POST",
        headers: platformHeaders("security-size-org", {
          "content-type": "application/json",
          "idempotency-key": "security-oversize-0001"
        }),
        body: oversized
      }
    );
    const body = await response.json();

    assert.equal(response.status, 413);
    assert.equal(body.error, "payload_too_large");
    securityHeadersArePresent(response);

    const list = await fetch(
      `${harness.baseUrl}/v1/shipments?limit=10`,
      {
        headers: platformHeaders("security-size-org")
      }
    );
    const listBody = await list.json();
    assert.equal(list.status, 200);
    assert.equal(listBody.total, 0);
  } finally {
    await harness.close();
  }
});

test("internal security: rate limits isolate organizations and return Retry-After", async () => {
  const limiter = createFixedWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: 2,
    maxEntries: 32
  });
  const harness = await openHarness({
    rateLimiter: limiter
  });

  try {
    const requestFor = (organizationId) =>
      fetch(
        `${harness.baseUrl}/v1/shipments?limit=1`,
        {
          headers: platformHeaders(organizationId)
        }
      );

    assert.equal(
      (await requestFor("security-rate-a")).status,
      200
    );
    assert.equal(
      (await requestFor("security-rate-a")).status,
      200
    );

    const limited = await requestFor("security-rate-a");
    assert.equal(limited.status, 429);
    assert.match(
      limited.headers.get("retry-after") ?? "",
      /^\d+$/
    );
    securityHeadersArePresent(limited);

    const independentOrg =
      await requestFor("security-rate-b");
    assert.equal(independentOrg.status, 200);
  } finally {
    await harness.close();
  }
});
