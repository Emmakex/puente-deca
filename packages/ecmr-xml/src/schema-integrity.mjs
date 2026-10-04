import {
  createHash
} from "node:crypto";
import {
  readdir,
  readFile,
  stat
} from "node:fs/promises";
import {
  join,
  relative,
  resolve,
  sep
} from "node:path";

const sha256 = (
  value
) =>
  `sha256:${createHash("sha256")
    .update(value)
    .digest("hex")}`;

export async function sha256File(
  path
) {
  return sha256(
    await readFile(
      path
    )
  );
}

const walk = async (
  root,
  current = root
) => {
  const entries =
    await readdir(
      current,
      {
        withFileTypes:
          true
      }
    );
  const files = [];

  for (
    const entry of
    entries
  ) {
    const absolute =
      join(
        current,
        entry.name
      );

    if (
      entry.isDirectory()
    ) {
      files.push(
        ...await walk(
          root,
          absolute
        )
      );
      continue;
    }

    if (
      !entry.isFile()
    ) {
      continue;
    }

    const normalized =
      relative(
        root,
        absolute
      )
        .split(sep)
        .join("/");

    if (
      normalized ===
      "pdeca-manifest.json"
    ) {
      continue;
    }

    const metadata =
      await stat(
        absolute
      );

    files.push({
      path:
        normalized,
      bytes:
        metadata.size,
      sha256:
        await sha256File(
          absolute
        )
    });
  }

  return files;
};

export async function createSchemaTreeEvidence(
  directory
) {
  const root =
    resolve(
      directory
    );
  const files =
    (
      await walk(
        root
      )
    ).sort(
      (
        first,
        second
      ) =>
        first.path.localeCompare(
          second.path,
          "en"
        )
    );

  const canonical =
    files
      .map(
        (entry) =>
          `${entry.path}\0${entry.bytes}\0${entry.sha256}`
      )
      .join("\n");

  return {
    schemaFileCount:
      files.length,
    schemaTreeSha256:
      sha256(
        Buffer.from(
          canonical,
          "utf8"
        )
      ),
    schemaFiles:
      files
  };
}

export async function verifySchemaTreeEvidence({
  directory,
  manifest
}) {
  if (
    !Array.isArray(
      manifest?.schemaFiles
    ) ||
    manifest.schemaFiles
      .length === 0 ||
    typeof manifest
      ?.schemaTreeSha256 !==
      "string" ||
    !Number.isInteger(
      manifest
        ?.schemaFileCount
    )
  ) {
    const error =
      new Error(
        "Installed eCMR schema manifest does not contain complete schema-tree evidence"
      );
    error.code =
      "ECMR_D25A_SCHEMA_TREE_EVIDENCE_MISSING";
    throw error;
  }

  const current =
    await createSchemaTreeEvidence(
      directory
    );

  if (
    current.schemaFileCount !==
      manifest.schemaFileCount ||
    current.schemaTreeSha256 !==
      manifest.schemaTreeSha256
  ) {
    const error =
      new Error(
        "Installed eCMR D25A schema tree no longer matches the recorded manifest"
      );
    error.code =
      "ECMR_D25A_SCHEMA_TREE_HASH_MISMATCH";
    throw error;
  }

  if (
    current.schemaFiles.length !==
      manifest.schemaFiles
        .length
  ) {
    const error =
      new Error(
        "Installed eCMR D25A schema file inventory no longer matches the recorded manifest"
      );
    error.code =
      "ECMR_D25A_SCHEMA_TREE_FILE_MISMATCH";
    throw error;
  }

  for (
    let index = 0;
    index <
      current.schemaFiles
        .length;
    index += 1
  ) {
    const expected =
      manifest.schemaFiles[
        index
      ];
    const actual =
      current.schemaFiles[
        index
      ];

    if (
      expected?.path !==
        actual.path ||
      expected?.bytes !==
        actual.bytes ||
      expected?.sha256 !==
        actual.sha256
    ) {
      const error =
        new Error(
          `Installed eCMR D25A schema file differs from manifest: ${actual.path}`
        );
      error.code =
        "ECMR_D25A_SCHEMA_FILE_HASH_MISMATCH";
      error.schemaPath =
        actual.path;
      throw error;
    }
  }

  return current;
}
