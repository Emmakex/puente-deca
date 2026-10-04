import {
  createHash
} from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import {
  tmpdir
} from "node:os";
import {
  dirname,
  join,
  resolve
} from "node:path";
import {
  spawnSync
} from "node:child_process";
import {
  ECMR_D25A_PROFILE
} from "./d25a-profile.mjs";
import {
  createSchemaTreeEvidence,
  sha256File,
  verifySchemaTreeEvidence
} from "./schema-integrity.mjs";


const safeEntries = (
  entries
) =>
  entries.every(
    (entry) =>
      entry &&
      !entry.startsWith("/") &&
      !entry.includes("\\") &&
      !entry
        .split("/")
        .includes("..")
  );

const runUnzip = (
  args,
  {
    encoding = "utf8"
  } = {}
) => {
  const result =
    spawnSync(
      "unzip",
      args,
      {
        encoding,
        maxBuffer:
          16 * 1024 * 1024
      }
    );

  if (
    result.error?.code ===
    "ENOENT"
  ) {
    const error = new Error(
      "unzip is required to install the official eCMR D25A schema bundle"
    );
    error.code =
      "ECMR_D25A_UNZIP_REQUIRED";
    throw error;
  }

  if (result.status !== 0) {
    const error = new Error(
      "Official eCMR D25A archive could not be read"
    );
    error.code =
      "ECMR_D25A_ARCHIVE_INVALID";
    throw error;
  }

  return result.stdout;
};

export async function installEcmrD25aSchemaBundle({
  archivePath,
  targetDirectory,
  replace = false
}) {
  const source =
    resolve(archivePath);
  const target =
    resolve(
      targetDirectory
    );

  await access(source);

  const outerEntries =
    String(
      runUnzip([
        "-Z1",
        source
      ])
    )
      .split(/\r?\n/)
      .filter(Boolean);

  if (
    !safeEntries(
      outerEntries
    )
  ) {
    const error = new Error(
      "Official archive contains unsafe paths"
    );
    error.code =
      "ECMR_D25A_ARCHIVE_UNSAFE";
    throw error;
  }

  const nestedPath =
    ECMR_D25A_PROFILE
      .nestedSchemaArchive;

  if (
    !outerEntries.includes(
      nestedPath
    )
  ) {
    const error = new Error(
      "Official archive does not contain XSD/Schema.zip"
    );
    error.code =
      "ECMR_D25A_SCHEMA_ARCHIVE_MISSING";
    throw error;
  }

  const workspace =
    await mkdtemp(
      join(
        tmpdir(),
        "pdeca-ecmr-d25a-"
      )
    );
  const nestedArchive =
    join(
      workspace,
      "Schema.zip"
    );
  const extracted =
    join(
      workspace,
      "schema"
    );

  try {
    const nestedBytes =
      runUnzip(
        [
          "-p",
          source,
          nestedPath
        ],
        {
          encoding: null
        }
      );

    await writeFile(
      nestedArchive,
      nestedBytes
    );

    const nestedEntries =
      String(
        runUnzip([
          "-Z1",
          nestedArchive
        ])
      )
        .split(/\r?\n/)
        .filter(Boolean);

    if (
      !safeEntries(
        nestedEntries
      )
    ) {
      const error =
        new Error(
          "Nested schema archive contains unsafe paths"
        );
      error.code =
        "ECMR_D25A_SCHEMA_ARCHIVE_UNSAFE";
      throw error;
    }

    if (
      !nestedEntries.includes(
        ECMR_D25A_PROFILE
          .rootSchema
      )
    ) {
      const error =
        new Error(
          "Official schema archive does not contain the D25A root schema"
        );
      error.code =
        "ECMR_D25A_ROOT_SCHEMA_MISSING";
      throw error;
    }

    await mkdir(
      extracted,
      {
        recursive: true
      }
    );

    runUnzip([
      "-q",
      nestedArchive,
      "-d",
      extracted
    ]);

    const rootSchemaPath =
      join(
        extracted,
        ECMR_D25A_PROFILE
          .rootSchema
      );

    const schemaTree =
      await createSchemaTreeEvidence(
        extracted
      );

    const manifest = {
      schemaVersion: 2,
      source:
        ECMR_D25A_PROFILE
          .sourcePage,
      sourceFile:
        ECMR_D25A_PROFILE
          .sourceFileName,
      sourceFileId:
        ECMR_D25A_PROFILE
          .sourceFileId,
      release:
        ECMR_D25A_PROFILE
          .release,
      publishedOn:
        ECMR_D25A_PROFILE
          .publishedOn,
      nestedSchemaArchive:
        nestedPath,
      rootSchema:
        ECMR_D25A_PROFILE
          .rootSchema,
      archiveSha256:
        await sha256File(
          source
        ),
      nestedSchemaArchiveSha256:
        await sha256File(
          nestedArchive
        ),
      rootSchemaSha256:
        await sha256File(
          rootSchemaPath
        ),
      schemaFileCount:
        schemaTree
          .schemaFileCount,
      schemaTreeSha256:
        schemaTree
          .schemaTreeSha256,
      schemaFiles:
        schemaTree
          .schemaFiles
    };

    await writeFile(
      join(
        extracted,
        "pdeca-manifest.json"
      ),
      `${JSON.stringify(
        manifest,
        null,
        2
      )}\n`,
      "utf8"
    );

    try {
      await access(target);

      if (!replace) {
        const error =
          new Error(
            "Target schema directory already exists"
          );
        error.code =
          "ECMR_D25A_SCHEMA_TARGET_EXISTS";
        throw error;
      }

      await rm(
        target,
        {
          recursive: true,
          force: true
        }
      );
    } catch (error) {
      if (
        error?.code !==
          "ENOENT" &&
        error?.code !==
          "ECMR_D25A_SCHEMA_TARGET_EXISTS"
      ) {
        throw error;
      }

      if (
        error?.code ===
        "ECMR_D25A_SCHEMA_TARGET_EXISTS"
      ) {
        throw error;
      }
    }

    await mkdir(
      dirname(target),
      {
        recursive: true
      }
    );

    await rename(
      extracted,
      target
    );

    return {
      ...manifest,
      targetDirectory:
        target
    };
  } finally {
    await rm(
      workspace,
      {
        recursive: true,
        force: true
      }
    );
  }
}

export async function readEcmrD25aSchemaManifest(
  schemaDirectory
) {
  const directory =
    resolve(
      schemaDirectory
    );
  const manifest =
    JSON.parse(
      await readFile(
        join(
          directory,
          "pdeca-manifest.json"
        ),
        "utf8"
      )
    );

  if (
    manifest.schemaVersion !==
      2 ||
    manifest.release !==
      ECMR_D25A_PROFILE.release ||
    manifest.rootSchema !==
      ECMR_D25A_PROFILE.rootSchema ||
    manifest.sourceFile !==
      ECMR_D25A_PROFILE
        .sourceFileName ||
    manifest.sourceFileId !==
      ECMR_D25A_PROFILE
        .sourceFileId ||
    manifest.nestedSchemaArchive !==
      ECMR_D25A_PROFILE
        .nestedSchemaArchive
  ) {
    const error =
      new Error(
        "Installed eCMR schema manifest does not match the pinned D25A profile"
      );
    error.code =
      "ECMR_D25A_SCHEMA_MANIFEST_MISMATCH";
    throw error;
  }

  const root =
    join(
      directory,
      manifest.rootSchema
    );

  if (
    await sha256File(root) !==
    manifest.rootSchemaSha256
  ) {
    const error =
      new Error(
        "Installed eCMR D25A root schema hash does not match its manifest"
      );
    error.code =
      "ECMR_D25A_ROOT_SCHEMA_HASH_MISMATCH";
    throw error;
  }

  const schemaTree =
    await verifySchemaTreeEvidence({
      directory,
      manifest
    });

  return {
    directory,
    rootSchemaPath:
      root,
    manifest,
    schemaTree
  };
}
