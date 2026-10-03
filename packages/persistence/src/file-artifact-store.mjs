import {
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile
} from "node:fs/promises";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";

const requireText = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
};

const safeStorageKey = (storageKey) => {
  const value = requireText(storageKey, "storageKey");

  if (
    basename(value) !== value ||
    !/^[A-Za-z0-9_.-]+\.pdf$/.test(value)
  ) {
    throw new TypeError("Invalid artifact storage key");
  }

  return value;
};

export class FileArtifactStore {
  #rootDirectory;

  constructor({ rootDirectory }) {
    this.#rootDirectory = requireText(
      rootDirectory,
      "rootDirectory"
    );
  }

  static async open(options) {
    const store = new FileArtifactStore(options);
    await mkdir(store.#rootDirectory, { recursive: true });
    return store;
  }

  async save({ documentId, bytes }) {
    const normalizedDocumentId = requireText(
      documentId,
      "documentId"
    );

    if (!/^[A-Za-z0-9_.-]+$/.test(normalizedDocumentId)) {
      throw new TypeError("Invalid documentId");
    }

    if (!Buffer.isBuffer(bytes)) {
      throw new TypeError("bytes must be a Buffer");
    }

    const storageKey = `${normalizedDocumentId}.pdf`;
    const path = join(this.#rootDirectory, storageKey);

    try {
      await writeFile(path, bytes, { flag: "wx" });
    } catch (error) {
      if (error?.code === "EEXIST") {
        const conflict = new Error("Artifact already exists");
        conflict.code = "ARTIFACT_EXISTS";
        throw conflict;
      }
      throw error;
    }

    return {
      storageKey,
      size: bytes.length,
      sha256: `sha256:${createHash("sha256")
        .update(bytes)
        .digest("hex")}`,
      contentType: "application/pdf"
    };
  }

  async read(storageKey) {
    return readFile(
      join(this.#rootDirectory, safeStorageKey(storageKey))
    );
  }

  async probe() {
    await readdir(this.#rootDirectory);

    return {
      ok: true,
      driver: "file"
    };
  }

  async listStorageKeys() {
    const entries = await readdir(
      this.#rootDirectory,
      {
        withFileTypes: true
      }
    );

    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          /^[A-Za-z0-9_.-]+\.pdf$/.test(
            entry.name
          )
      )
      .map((entry) => entry.name)
      .sort();
  }

  async remove(storageKey) {
    const path = join(
      this.#rootDirectory,
      safeStorageKey(storageKey)
    );

    try {
      await unlink(path);
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  }
}
