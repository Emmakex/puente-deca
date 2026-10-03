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

test("revoked keys stop authenticating and cannot cross tenant boundaries", async () => {
  await withStore(async ({ store }) => {
    const first = await store.createOrganization({
      name: "First"
    });
    const second = await store.createOrganization({
      name: "Second"
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
