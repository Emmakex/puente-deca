import {
  resolve
} from "node:path";
import {
  validateEcmrD25aXmlFile
} from "../../packages/ecmr-xml/src/schema-validation.mjs";

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
      "ECMR_D25A_XML_CONFIGURATION_INVALID";
    throw error;
  }

  return value.trim();
};

const xmlPath =
  requireText(
    process.env
      .ECMR_D25A_XML,
    "ECMR_D25A_XML"
  );

const schemaDirectory =
  resolve(
    process.env
      .ECMR_D25A_SCHEMA_DIR ??
      "vendor/uncefact/ecmr/D25A"
  );

try {
  const result =
    await validateEcmrD25aXmlFile({
      xmlPath,
      schemaDirectory
    });

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          "ecmr-d25a-schema-validation",
        valid:
          result.valid,
        release:
          result.release,
        sourceFile:
          result.sourceFile,
        sourceFileId:
          result.sourceFileId,
        archiveSha256:
          result.archiveSha256,
        nestedSchemaArchive:
          result.nestedSchemaArchive,
        nestedSchemaArchiveSha256:
          result.nestedSchemaArchiveSha256,
        rootSchema:
          result.rootSchema,
        rootSchemaSha256:
          result.rootSchemaSha256,
        schemaFileCount:
          result.schemaFileCount,
        schemaTreeSha256:
          result.schemaTreeSha256,
        xmlSha256:
          result.xmlSha256,
        networkAccess:
          result.networkAccess
      },
      null,
      2
    )}\n`
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check:
        "ecmr-d25a-schema-validation",
      code:
        typeof error?.code ===
          "string"
          ? error.code
          : "ECMR_D25A_SCHEMA_VALIDATION_FAILED",
      validationOutput:
        Array.isArray(
          error?.validationOutput
        )
          ? error.validationOutput
          : undefined
    })}\n`
  );

  process.exitCode = 1;
}
