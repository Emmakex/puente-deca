import {
  createHash
} from "node:crypto";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import {
  tmpdir
} from "node:os";
import {
  join,
  resolve
} from "node:path";
import {
  spawnSync
} from "node:child_process";
import {
  GridFSBucket,
  MongoClient
} from "mongodb";

const requireText = (
  value,
  name
) => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    const error = new Error(
      `${name} is required`
    );
    error.code =
      "RESTORE_CONFIGURATION_INVALID";
    throw error;
  }

  return value.trim();
};

const run = (
  command,
  args
) => {
  const result = spawnSync(
    command,
    args,
    {
      encoding: "utf8",
      env: process.env,
      maxBuffer:
        8 * 1024 * 1024
    }
  );

  if (result.status !== 0) {
    const error = new Error(
      `${command} failed`
    );
    error.code =
      command === "mongorestore"
        ? "MONGORESTORE_FAILED"
        : "RESTORE_TOOL_FAILED";
    error.exitCode =
      result.status;
    throw error;
  }

  return result.stdout.trim();
};

const sha256 = (bytes) =>
  createHash("sha256")
    .update(bytes)
    .digest("hex");

const requiredMetadataCollections =
  [
    "deca_organizations",
    "deca_api_credentials",
    "deca_shipments",
    "deca_document_versions",
    "deca_idempotency",
    "deca_audit_events",
    "deca_artifact_purges",
    "deca_pdf.files"
  ];

const main = async () => {
  const restoreUri =
    requireText(
      process.env
        .RESTORE_MONGODB_URI,
      "RESTORE_MONGODB_URI"
    );

  if (
    !/^mongodb(?:\+srv)?:\/\//.test(
      restoreUri
    )
  ) {
    const error = new Error(
      "RESTORE_MONGODB_URI must be a MongoDB URI"
    );
    error.code =
      "RESTORE_CONFIGURATION_INVALID";
    throw error;
  }

  const restoreDatabase =
    requireText(
      process.env.RESTORE_DB_NAME,
      "RESTORE_DB_NAME"
    );

  if (
    restoreDatabase ===
      "kairoseth" ||
    !/^kairoseth_deca_dr_[A-Za-z0-9_-]+$/.test(
      restoreDatabase
    )
  ) {
    const error = new Error(
      "RESTORE_DB_NAME must be an isolated kairoseth_deca_dr_* database"
    );
    error.code =
      "RESTORE_TARGET_DATABASE_INVALID";
    throw error;
  }

  const archivePath =
    resolve(
      requireText(
        process.env.BACKUP_ARCHIVE,
        "BACKUP_ARCHIVE"
      )
    );

  const expectedChecksum =
    requireText(
      process.env
        .BACKUP_EXPECTED_SHA256,
      "BACKUP_EXPECTED_SHA256"
    );

  if (
    !/^sha256:[a-f0-9]{64}$/.test(
      expectedChecksum
    )
  ) {
    const error = new Error(
      "BACKUP_EXPECTED_SHA256 must be sha256:<hex>"
    );
    error.code =
      "RESTORE_CHECKSUM_INVALID";
    throw error;
  }

  const archiveStat =
    await stat(archivePath);

  if (archiveStat.size <= 0) {
    const error = new Error(
      "Backup archive is empty"
    );
    error.code =
      "RESTORE_ARCHIVE_EMPTY";
    throw error;
  }

  const archiveBytes =
    await readFile(
      archivePath
    );
  const actualChecksum =
    `sha256:${sha256(
      archiveBytes
    )}`;

  if (
    actualChecksum !==
      expectedChecksum
  ) {
    const error = new Error(
      "Backup archive checksum mismatch"
    );
    error.code =
      "RESTORE_CHECKSUM_MISMATCH";
    throw error;
  }

  run(
    "mongorestore",
    ["--version"]
  );

  const configDirectory =
    await mkdtemp(
      join(
        tmpdir(),
        "pdeca-mongorestore-"
      )
    );
  const configPath =
    join(
      configDirectory,
      "mongo-tools.yml"
    );

  try {
    await writeFile(
      configPath,
      `uri: ${JSON.stringify(
        restoreUri
      )}\n`,
      {
        encoding: "utf8",
        mode: 0o600
      }
    );
    await chmod(
      configPath,
      0o600
    );

    run(
      "mongorestore",
      [
        `--config=${configPath}`,
        `--archive=${archivePath}`,
        "--gzip",
        "--stopOnError",
        "--drop",
        "--nsInclude=kairoseth.deca_*",
        "--nsFrom=kairoseth.*",
        `--nsTo=${restoreDatabase}.*`
      ]
    );
  } finally {
    await rm(
      configDirectory,
      {
        recursive: true,
        force: true
      }
    );
  }

  const client =
    new MongoClient(
      restoreUri,
      {
        appName:
          "kairoseth-puente-deca-restore-drill",
        family: 4,
        connectTimeoutMS:
          10_000,
        serverSelectionTimeoutMS:
          10_000
      }
    );

  try {
    await client.connect();

    const database =
      client.db(
        restoreDatabase
      );

    const collections =
      await database
        .listCollections(
          {},
          {
            nameOnly: true
          }
        )
        .toArray();

    const collectionNames =
      new Set(
        collections.map(
          (entry) =>
            entry.name
        )
      );

    const missingCollections =
      requiredMetadataCollections
        .filter(
          (name) =>
            !collectionNames.has(name)
        );

    if (
      missingCollections.length >
      0
    ) {
      const error = new Error(
        "Restored database is missing required collections"
      );
      error.code =
        "RESTORE_COLLECTIONS_MISSING";
      error.missingCollections =
        missingCollections;
      throw error;
    }

    const artifactFiles =
      await database
        .collection(
          "deca_pdf.files"
        )
        .find({})
        .sort({
          uploadDate: 1
        })
        .limit(1)
        .toArray();

    if (
      artifactFiles.length === 0
    ) {
      const error = new Error(
        "Restore drill requires at least one DeCA PDF artifact"
      );
      error.code =
        "RESTORE_ARTIFACT_MISSING";
      throw error;
    }

    if (
      !collectionNames.has(
        "deca_pdf.chunks"
      )
    ) {
      const error = new Error(
        "Restored GridFS chunks collection is missing"
      );
      error.code =
        "RESTORE_GRIDFS_CHUNKS_MISSING";
      throw error;
    }

    const file =
      artifactFiles[0];
    const bucket =
      new GridFSBucket(
        database,
        {
          bucketName:
            "deca_pdf"
        }
      );

    const chunks = [];
    let byteLength = 0;

    for await (
      const chunk of
      bucket.openDownloadStream(
        file._id
      )
    ) {
      byteLength +=
        chunk.length;

      if (
        byteLength >
        5_000_000
      ) {
        const error = new Error(
          "Restored DeCA artifact exceeds 5 MB"
        );
        error.code =
          "RESTORE_ARTIFACT_SIZE_LIMIT";
        throw error;
      }

      chunks.push(chunk);
    }

    const artifactBytes =
      Buffer.concat(
        chunks,
        byteLength
      );
    const actualArtifactSha =
      `sha256:${sha256(
        artifactBytes
      )}`;
    const expectedArtifactSha =
      file?.metadata?.sha256;

    if (
      typeof expectedArtifactSha !==
        "string" ||
      actualArtifactSha !==
        expectedArtifactSha
    ) {
      const error = new Error(
        "Restored GridFS artifact SHA-256 mismatch"
      );
      error.code =
        "RESTORE_ARTIFACT_INTEGRITY_MISMATCH";
      throw error;
    }

    const counts = {};

    for (
      const collectionName of
      requiredMetadataCollections
    ) {
      counts[
        collectionName
      ] =
        await database
          .collection(
            collectionName
          )
          .countDocuments();
    }

    counts[
      "deca_pdf.chunks"
    ] =
      await database
        .collection(
          "deca_pdf.chunks"
        )
        .countDocuments();

    process.stdout.write(
      `${JSON.stringify(
        {
          status: "ok",
          check:
            "puente-deca-restore-drill",
          sourceDatabase:
            "kairoseth",
          restoreDatabase,
          archiveBytes:
            archiveStat.size,
          archiveSha256:
            actualChecksum,
          collections:
            [...collectionNames]
              .filter(
                (name) =>
                  name.startsWith(
                    "deca_"
                  )
              )
              .sort(),
          counts,
          sampleArtifactVerified:
            true,
          sampleArtifactBytes:
            artifactBytes.length
        },
        null,
        2
      )}\n`
    );
  } finally {
    await client.close();
  }
};

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check:
        "puente-deca-restore-drill",
      code:
        typeof error?.code ===
          "string"
          ? error.code
          : "RESTORE_DRILL_FAILED",
      missingCollections:
        Array.isArray(
          error?.missingCollections
        )
          ? error.missingCollections
          : undefined
    })}\n`
  );

  process.exitCode = 1;
});
