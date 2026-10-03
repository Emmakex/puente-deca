import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../src/json-store.mjs";

const withStore = async (fn) => {
  const directory = await mkdtemp(
    join(tmpdir(), "puente-deca-credentials-")
  );
  const filePath = join(directory, "store.json");

  let id = 0;
  const store = await JsonStore.open({
    filePath,
    now: () =>
      new Date("2026-10-03T05:45:00.000Z"),
    idFactory: () =>
      String(++id).padStart(4, "0"),
    apiKeyFactory: () =>
      "pdeca_test_abcdefghijklmnopqrstuvxyz123456"
  });

  try {
    await fn({ store, filePath });
  } finally {
    await rm(directory, {
      recursive: true,
      force: true
    });
  }
};

test("creates an API key once while persisting only its hash", async () => {
  await withStore(async ({ store, filePath }) => {
    const organization =
      await store.createOrganization({
        name: "Organization 001"
      });

    await store.setOrganizationConnectorAccessUntil({
      organizationId:
        organization.organizationId,
      validUntil:
        new Date("2026-11-03T05:45:00.000Z")
    });

    const created =
      await store.createApiCredential({
        organizationId:
          organization.organizationId,
        name: "ERP production",
        scopes: [
          "documents:write",
          "shipments:write"
        ]
      });

    assert.equal(
      created.apiKey,
      "pdeca_test_abcdefghijklmnopqrstuvxyz123456"
    );
    assert.deepEqual(
      created.credential.scopes,
      ["documents:write", "shipments:write"]
    );
    assert.equal(
      created.credential.kind,
      "api",
      "legacy callers without kind must default to api"
    );

    const raw = await readFile(filePath, "utf8");
    assert.equal(
      raw.includes(created.apiKey),
      false,
      "raw API key must never be persisted"
    );

    const authenticated =
      await store.authenticateApiKey(created.apiKey);

    assert.equal(
      authenticated.credentialId,
      created.credential.credentialId
    );
    assert.equal(
      authenticated.organizationId,
      organization.organizationId
    );
  });
});

test("credential kind is persisted and returned without exposing key material", async () => {
  await withStore(async ({ store, filePath }) => {
    const organization =
      await store.createOrganization({
        name: "Typed credentials"
      });

    await store.setOrganizationConnectorAccessUntil({
      organizationId:
        organization.organizationId,
      validUntil:
        new Date("2026-11-03T05:45:00.000Z")
    });

    const created =
      await store.createApiCredential({
        organizationId:
          organization.organizationId,
        name: "WooCommerce production",
        kind: "woocommerce"
      });

    assert.equal(
      created.credential.kind,
      "woocommerce"
    );

    const listed =
      await store.listApiCredentials(
        organization.organizationId
      );
    assert.equal(listed.length, 1);
    assert.equal(
      listed[0].kind,
      "woocommerce"
    );
    assert.equal(
      "keyHash" in listed[0],
      false
    );

    const raw = JSON.parse(
      await readFile(filePath, "utf8")
    );
    const persisted =
      Object.values(raw.apiCredentials)[0];
    assert.equal(
      persisted.kind,
      "woocommerce"
    );
  });
});

test("unsupported credential kinds fail closed", async () => {
  await withStore(async ({ store }) => {
    const organization =
      await store.createOrganization({
        name: "Typed credentials"
      });

    await store.setOrganizationConnectorAccessUntil({
      organizationId:
        organization.organizationId,
      validUntil:
        new Date("2026-11-03T05:45:00.000Z")
    });

    await assert.rejects(
      () =>
        store.createApiCredential({
          organizationId:
            organization.organizationId,
          name: "Unknown connector",
          kind: "magento"
        }),
      /supported credential kind/
    );
  });
});

test("connector lease is required to create and authenticate API keys", async () => {
  await withStore(async ({ store }) => {
    const organization =
      await store.createOrganization({
        name: "Lease guarded"
      });

    await assert.rejects(
      () =>
        store.createApiCredential({
          organizationId:
            organization.organizationId,
          name: "No lease"
        }),
      (error) =>
        error.code ===
        "ORGANIZATION_CONNECTOR_ACCESS_INACTIVE"
    );

    await store.setOrganizationConnectorAccessUntil({
      organizationId:
        organization.organizationId,
      validUntil:
        new Date("2026-11-03T05:45:00.000Z")
    });

    const created =
      await store.createApiCredential({
        organizationId:
          organization.organizationId,
        name: "Leased connector"
      });

    assert.ok(
      await store.authenticateApiKey(
        created.apiKey
      )
    );

    await store.setOrganizationConnectorAccessUntil({
      organizationId:
        organization.organizationId,
      validUntil:
        new Date("2026-10-03T05:45:00.000Z")
    });

    assert.equal(
      await store.authenticateApiKey(
        created.apiKey
      ),
      null
    );
  });
});

test("credential expiry is returned publicly and enforced during authentication", async () => {
  await withStore(async ({ store }) => {
    const organization =
      await store.createOrganization({
        name: "Organization 001"
      });

    await store.setOrganizationConnectorAccessUntil({
      organizationId:
        organization.organizationId,
      validUntil:
        new Date("2026-11-03T05:45:00.000Z")
    });

    const created =
      await store.createApiCredential({
        organizationId:
          organization.organizationId,
        name: "WooCommerce",
        expiresAt:
          new Date("2026-10-04T05:45:00.000Z")
      });

    assert.equal(
      created.credential.expiresAt,
      "2026-10-04T05:45:00.000Z"
    );
    assert.ok(
      await store.authenticateApiKey(
        created.apiKey
      )
    );

    const synced =
      await store.setApiCredentialExpiryForOrganization({
        organizationId:
          organization.organizationId,
        expiresAt:
          new Date("2026-10-03T05:44:59.000Z")
      });

    assert.equal(synced.updated, 1);
    assert.equal(
      await store.authenticateApiKey(
        created.apiKey
      ),
      null
    );
  });
});

test("revoked keys stop authenticating and cannot cross tenant boundaries", async () => {
  await withStore(async ({ store }) => {
    const first = await store.createOrganization({
      name: "First"
    });
    const second = await store.createOrganization({
      name: "Second"
    });

    await store.setOrganizationConnectorAccessUntil({
      organizationId:
        first.organizationId,
      validUntil:
        new Date("2026-11-03T05:45:00.000Z")
    });

    const created =
      await store.createApiCredential({
        organizationId:
          first.organizationId,
        name: "Connector"
      });

    await assert.rejects(
      () =>
        store.revokeApiCredential({
          organizationId:
            second.organizationId,
          credentialId:
            created.credential.credentialId
        }),
      (error) =>
        error.code === "API_CREDENTIAL_NOT_FOUND"
    );

    const revoked =
      await store.revokeApiCredential({
        organizationId:
          first.organizationId,
        credentialId:
          created.credential.credentialId
      });

    assert.ok(revoked.revokedAt);
    assert.equal(
      await store.authenticateApiKey(created.apiKey),
      null
    );

    const credentials =
      await store.listApiCredentials(
        first.organizationId
      );

    assert.equal(credentials.length, 1);
    assert.equal(
      credentials[0].credentialId,
      created.credential.credentialId
    );
    assert.equal(
      "keyHash" in credentials[0],
      false
    );
  });
});
