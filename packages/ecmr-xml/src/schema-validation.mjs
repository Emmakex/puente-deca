import {
  spawnSync
} from "node:child_process";
import {
  resolve
} from "node:path";
import {
  readEcmrD25aSchemaManifest
} from "./schema-bundle.mjs";
import {
  sha256File
} from "./schema-integrity.mjs";

export async function validateEcmrD25aXmlFile({
  xmlPath,
  schemaDirectory,
  spawn = spawnSync
}) {
  const schema =
    await readEcmrD25aSchemaManifest(
      schemaDirectory
    );
  const xml =
    resolve(
      xmlPath
    );

  const result =
    spawn(
      "xmllint",
      [
        "--nonet",
        "--noout",
        "--schema",
        schema.rootSchemaPath,
        xml
      ],
      {
        encoding:
          "utf8",
        maxBuffer:
          4 * 1024 * 1024
      }
    );

  if (
    result.error?.code ===
    "ENOENT"
  ) {
    const error = new Error(
      "xmllint is required for official eCMR D25A XSD validation"
    );
    error.code =
      "ECMR_D25A_XMLLINT_REQUIRED";
    throw error;
  }

  if (
    result.status !== 0
  ) {
    const error = new Error(
      "eCMR XML failed official D25A schema validation"
    );
    error.code =
      "ECMR_D25A_SCHEMA_VALIDATION_FAILED";
    error.validationOutput =
      String(
        result.stderr ??
        ""
      )
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, 25);
    throw error;
  }

  return {
    valid: true,
    release:
      schema.manifest.release,
    sourceFile:
      schema.manifest
        .sourceFile,
    sourceFileId:
      schema.manifest
        .sourceFileId,
    archiveSha256:
      schema.manifest
        .archiveSha256,
    nestedSchemaArchive:
      schema.manifest
        .nestedSchemaArchive,
    nestedSchemaArchiveSha256:
      schema.manifest
        .nestedSchemaArchiveSha256,
    rootSchema:
      schema.manifest
        .rootSchema,
    rootSchemaSha256:
      schema.manifest
        .rootSchemaSha256,
    schemaFileCount:
      schema.schemaTree
        .schemaFileCount,
    schemaTreeSha256:
      schema.schemaTree
        .schemaTreeSha256,
    xmlSha256:
      await sha256File(
        xml
      ),
    networkAccess:
      false
  };
}
