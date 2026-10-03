import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openArtifactStore,
  resolveArtifactDriver
} from "../src/artifact-store-factory.mjs";

test("artifact driver follows MongoDB Atlas configuration", () => {
  assert.equal(
    resolveArtifactDriver({
      ARTIFACT_DRIVER: "gridfs"
    }),
    "gridfs"
  );
  assert.equal(
    resolveArtifactDriver({
      MONGODB_URI:
        "mongodb+srv://example.invalid/kairoseth"
    }),
    "gridfs"
  );
  assert.equal(
    resolveArtifactDriver({}),
    "file"
  );
});

test("production refuses filesystem PDF storage", async () => {
  await assert.rejects(
    openArtifactStore({
      env: {
        NODE_ENV: "production",
        ARTIFACT_DRIVER: "file",
        ARTIFACT_DIR: "/tmp/deca-artifacts"
      }
    }),
    /Filesystem artifact storage is disabled in production/
  );
});

test("development file artifact storage remains available", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "pdeca-artifacts-")
  );

  try {
    const store = await openArtifactStore({
      env: {
        NODE_ENV: "test",
        ARTIFACT_DRIVER: "file",
        ARTIFACT_DIR: directory
      }
    });

    const bytes = Buffer.from("%PDF-test");
    const saved = await store.save({
      documentId: "doc_factory",
      bytes
    });

    assert.equal(
      (await store.read(saved.storageKey)).toString(),
      bytes.toString()
    );
  } finally {
    await rm(directory, {
      recursive: true,
      force: true
    });
  }
});

test("unsupported artifact drivers fail closed", async () => {
  await assert.rejects(
    openArtifactStore({
      env: {
        ARTIFACT_DRIVER: "s3"
      }
    }),
    /Unsupported ARTIFACT_DRIVER/
  );
});
