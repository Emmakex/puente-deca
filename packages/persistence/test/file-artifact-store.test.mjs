import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileArtifactStore
} from "../src/file-artifact-store.mjs";

test("stores, reads and removes PDF artifacts", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "puente-deca-artifacts-")
  );

  try {
    const store = await FileArtifactStore.open({
      rootDirectory: directory
    });
    const bytes = Buffer.from(
      "%PDF-1.7\nexample\n%%EOF\n",
      "latin1"
    );

    const metadata = await store.save({
      documentId: "deca_demo",
      bytes
    });

    assert.equal(metadata.storageKey, "deca_demo.pdf");
    assert.equal(metadata.size, bytes.length);
    assert.match(metadata.sha256, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(
      await store.read(metadata.storageKey),
      bytes
    );

    assert.equal(
      await store.remove(metadata.storageKey),
      true
    );
    assert.equal(
      await store.remove(metadata.storageKey),
      false
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
