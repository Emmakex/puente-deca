import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openOperationalStore,
  resolvePersistenceDriver
} from "../src/store-factory.mjs";

test("persistence driver resolves explicitly and from DATABASE_URL", () => {
  assert.equal(
    resolvePersistenceDriver({
      PERSISTENCE_DRIVER: "postgres"
    }),
    "postgres"
  );
  assert.equal(
    resolvePersistenceDriver({
      DATABASE_URL:
        "postgres://example.invalid/deca"
    }),
    "postgres"
  );
  assert.equal(
    resolvePersistenceDriver({}),
    "json"
  );
});

test("production refuses implicit JSON persistence", async () => {
  await assert.rejects(
    openOperationalStore({
      env: {
        NODE_ENV: "production",
        PERSISTENCE_DRIVER: "json",
        STORE_PATH: "/tmp/should-not-open.json"
      }
    }),
    /JSON persistence is disabled in production/
  );
});

test("development JSON persistence remains available for fast tests", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "pdeca-store-factory-")
  );

  try {
    const store = await openOperationalStore({
      env: {
        NODE_ENV: "test",
        PERSISTENCE_DRIVER: "json",
        STORE_PATH: join(
          directory,
          "store.json"
        )
      },
      idFactory: () => "factory-test"
    });

    const organization =
      await store.createOrganization({
        name: "Factory Test"
      });

    assert.equal(
      organization.organizationId,
      "org_factory-test"
    );
  } finally {
    await rm(directory, {
      recursive: true,
      force: true
    });
  }
});

test("unsupported persistence drivers fail closed", async () => {
  await assert.rejects(
    openOperationalStore({
      env: {
        PERSISTENCE_DRIVER: "mystery"
      }
    }),
    /Unsupported PERSISTENCE_DRIVER/
  );
});
