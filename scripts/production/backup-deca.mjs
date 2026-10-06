import {
  createHash
} from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import {
  tmpdir
} from "node:os";
import {
  basename,
  join,
  resolve
} from "node:path";
import {
  spawnSync
} from "node:child_process";
import {
  decaBackupNamespaces
} from "./deca-backup-scope.mjs";

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
      "BACKUP_CONFIGURATION_INVALID";
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
      command === "mongodump"
        ? "MONGODUMP_FAILED"
        : "BACKUP_TOOL_FAILED";
    error.exitCode =
      result.status;
    throw error;
  }

  return result.stdout.trim();
};

const sha256File = async (
  path
) => {
  const bytes =
    await import(
      "node:fs/promises"
    ).then(
      ({ readFile }) =>
        readFile(path)
    );

  return createHash("sha256")
    .update(bytes)
    .digest("hex");
};

const main = async () => {
  const uri = requireText(
    process.env.MONGODB_URI,
    "MONGODB_URI"
  );

  if (
    !/^mongodb(?:\+srv)?:\/\//.test(
      uri
    )
  ) {
    const error = new Error(
      "MONGODB_URI must be a MongoDB URI"
    );
    error.code =
      "BACKUP_CONFIGURATION_INVALID";
    throw error;
  }

  const databaseName =
    (
      process.env.MONGODB_DB_NAME ??
      "kairoseth"
    ).trim();

  if (
    databaseName !== "kairoseth"
  ) {
    const error = new Error(
      "Backup source database must be kairoseth"
    );
    error.code =
      "BACKUP_SOURCE_DATABASE_INVALID";
    throw error;
  }

  const namespaces =
    decaBackupNamespaces(
      databaseName
    );

  const outputDirectory =
    resolve(
      process.env
        .BACKUP_OUTPUT_DIR ??
        "backups/puente-deca"
    );

  await mkdir(
    outputDirectory,
    { recursive: true }
  );

  const versionOutput = run(
    "mongodump",
    ["--version"]
  );
  const versionLine =
    versionOutput
      .split("\n")
      .find(Boolean) ??
      "mongodump";

  const stamp =
    new Date()
      .toISOString()
      .replace(
        /[-:.]/g,
        ""
      )
      .replace(
        "T",
        "-"
      );

  const archiveName =
    `puente-deca-${stamp}.archive.gz`;
  const archivePath =
    join(
      outputDirectory,
      archiveName
    );
  const checksumPath =
    `${archivePath}.sha256`;
  const metadataPath =
    `${archivePath}.metadata.json`;

  const configDirectory =
    await mkdtemp(
      join(
        tmpdir(),
        "pdeca-mongodump-"
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
      `uri: ${JSON.stringify(uri)}\n`,
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
      "mongodump",
      [
        `--config=${configPath}`,
        `--archive=${archivePath}`,
        "--gzip",
        ...namespaces.map(
          (namespace) =>
            `--nsInclude=${namespace}`
        )
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

  const archiveStat =
    await stat(archivePath);

  if (archiveStat.size <= 0) {
    const error = new Error(
      "Backup archive is empty"
    );
    error.code =
      "BACKUP_ARCHIVE_EMPTY";
    throw error;
  }

  const checksum =
    await sha256File(
      archivePath
    );

  await writeFile(
    checksumPath,
    `${checksum}  ${basename(
      archivePath
    )}\n`,
    "utf8"
  );

  const metadata = {
    schemaVersion: 2,
    product:
      "Kairoseth Puente DeCA",
    sourceDatabase:
      databaseName,
    namespaces,
    createdAt:
      new Date().toISOString(),
    archive:
      archiveName,
    bytes:
      archiveStat.size,
    sha256:
      `sha256:${checksum}`,
    tool:
      versionLine
  };

  await writeFile(
    metadataPath,
    `${JSON.stringify(
      metadata,
      null,
      2
    )}\n`,
    "utf8"
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          "puente-deca-backup",
        archive:
          archivePath,
        checksumFile:
          checksumPath,
        metadataFile:
          metadataPath,
        bytes:
          archiveStat.size,
        sha256:
          `sha256:${checksum}`,
        namespaces:
          metadata.namespaces
      },
      null,
      2
    )}\n`
  );
};

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check:
        "puente-deca-backup",
      code:
        typeof error?.code ===
          "string"
          ? error.code
          : "BACKUP_FAILED"
    })}\n`
  );

  process.exitCode = 1;
});
