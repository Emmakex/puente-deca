import { createHash } from "node:crypto";
import { finished } from "node:stream/promises";
import {
  GridFSBucket,
  MongoClient,
  ServerApiVersion
} from "mongodb";

const MAX_PDF_BYTES = 5_000_000;

const requireText = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} is required`);
  }

  return value.trim();
};

const safeStorageKey = (storageKey) => {
  const value = requireText(storageKey, "storageKey");

  if (!/^[A-Za-z0-9_.-]+\.pdf$/.test(value)) {
    throw new TypeError("Invalid artifact storage key");
  }

  return value;
};

const sha256 = (bytes) =>
  `sha256:${createHash("sha256")
    .update(bytes)
    .digest("hex")}`;

const notFound = () => {
  const error = new Error("Artifact not found");
  error.code = "ENOENT";
  return error;
};

export class GridFsArtifactStore {
  #client;
  #database;
  #bucket;
  #bucketName;
  #ownsClient;

  constructor({
    client,
    database,
    bucketName = "deca_pdf",
    ownsClient = false
  }) {
    if (!client || !database) {
      throw new TypeError(
        "MongoDB client and database are required"
      );
    }

    this.#client = client;
    this.#database = database;
    this.#bucketName = requireText(
      bucketName,
      "bucketName"
    );
    this.#bucket = new GridFSBucket(database, {
      bucketName: this.#bucketName
    });
    this.#ownsClient = ownsClient;
  }

  static async open({
    uri,
    databaseName = "kairoseth",
    bucketName = "deca_pdf",
    client = null
  } = {}) {
    const ownsClient = !client;
    const resolvedClient =
      client ??
      new MongoClient(
        requireText(uri, "uri"),
        {
          appName:
            "kairoseth-puente-deca-artifacts",
          family: 4,
          connectTimeoutMS: 10_000,
          serverSelectionTimeoutMS: 10_000,
          serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true
          }
        }
      );

    if (ownsClient) {
      await resolvedClient.connect();
    }

    const database = resolvedClient.db(
      requireText(databaseName, "databaseName")
    );
    const store = new GridFsArtifactStore({
      client: resolvedClient,
      database,
      bucketName,
      ownsClient
    });

    await store.ensureIndexes();
    return store;
  }

  async ensureIndexes() {
    await this.#database
      .collection(`${this.#bucketName}.files`)
      .createIndex(
        { filename: 1 },
        {
          unique: true,
          name: "deca_pdf_filename_unique"
        }
      );
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

    if (bytes.length > MAX_PDF_BYTES) {
      const error = new Error(
        "Artifact exceeds the DeCA PDF size limit"
      );
      error.code = "ARTIFACT_SIZE_LIMIT";
      throw error;
    }

    const storageKey =
      `${normalizedDocumentId}.pdf`;
    const checksum = sha256(bytes);

    const existing = await this.#database
      .collection(`${this.#bucketName}.files`)
      .findOne({ filename: storageKey });

    if (existing) {
      const conflict = new Error(
        "Artifact already exists"
      );
      conflict.code = "ARTIFACT_EXISTS";
      throw conflict;
    }

    const upload = this.#bucket.openUploadStream(
      storageKey,
      {
        contentType: "application/pdf",
        metadata: {
          documentId: normalizedDocumentId,
          sha256: checksum,
          size: bytes.length
        }
      }
    );

    try {
      upload.end(bytes);
      await finished(upload);
    } catch (error) {
      if (error?.code === 11000) {
        const conflict = new Error(
          "Artifact already exists"
        );
        conflict.code = "ARTIFACT_EXISTS";
        throw conflict;
      }
      throw error;
    }

    return {
      storageKey,
      size: bytes.length,
      sha256: checksum,
      contentType: "application/pdf"
    };
  }

  async read(storageKey) {
    const normalizedStorageKey =
      safeStorageKey(storageKey);

    const file = await this.#database
      .collection(`${this.#bucketName}.files`)
      .findOne({
        filename: normalizedStorageKey
      });

    if (!file) {
      throw notFound();
    }

    if (
      Number.isFinite(file.length) &&
      file.length > MAX_PDF_BYTES
    ) {
      const error = new Error(
        "Stored artifact exceeds the DeCA PDF size limit"
      );
      error.code = "ARTIFACT_SIZE_LIMIT";
      throw error;
    }

    const chunks = [];
    let size = 0;

    try {
      for await (
        const chunk of this.#bucket.openDownloadStream(
          file._id
        )
      ) {
        size += chunk.length;

        if (size > MAX_PDF_BYTES) {
          const error = new Error(
            "Stored artifact exceeds the DeCA PDF size limit"
          );
          error.code = "ARTIFACT_SIZE_LIMIT";
          throw error;
        }

        chunks.push(chunk);
      }
    } catch (error) {
      if (
        error?.code === "ENOENT" ||
        error?.code === "FileNotFound"
      ) {
        throw notFound();
      }
      throw error;
    }

    return Buffer.concat(chunks, size);
  }

  async listStorageKeys() {
    const files = await this.#database
      .collection(`${this.#bucketName}.files`)
      .find(
        {},
        {
          projection: {
            _id: 0,
            filename: 1
          }
        }
      )
      .sort({ filename: 1 })
      .toArray();

    return files
      .map((file) => file.filename)
      .filter(
        (filename) =>
          typeof filename === "string"
      );
  }

  async remove(storageKey) {
    const normalizedStorageKey =
      safeStorageKey(storageKey);

    const file = await this.#database
      .collection(`${this.#bucketName}.files`)
      .findOne({
        filename: normalizedStorageKey
      });

    if (!file) return false;

    await this.#bucket.delete(file._id);
    return true;
  }

  async close() {
    if (this.#ownsClient) {
      await this.#client.close();
    }
  }
}
