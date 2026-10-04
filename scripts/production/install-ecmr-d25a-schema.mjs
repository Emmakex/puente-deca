import {
  resolve
} from "node:path";
import {
  installEcmrD25aSchemaBundle
} from "../../packages/ecmr-xml/src/schema-bundle.mjs";

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
      "ECMR_D25A_SCHEMA_CONFIGURATION_INVALID";
    throw error;
  }

  return value.trim();
};

const archive =
  requireText(
    process.env
      .ECMR_D25A_ARCHIVE,
    "ECMR_D25A_ARCHIVE"
  );

const target =
  resolve(
    process.env
      .ECMR_D25A_SCHEMA_DIR ??
      "vendor/uncefact/ecmr/D25A"
  );

const replace =
  process.env
    .ECMR_D25A_SCHEMA_REPLACE ===
  "REPLACE_D25A_SCHEMA_BUNDLE";

try {
  const result =
    await installEcmrD25aSchemaBundle({
      archivePath:
        archive,
      targetDirectory:
        target,
      replace
    });

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          "ecmr-d25a-schema-install",
        release:
          result.release,
        sourceFile:
          result.sourceFile,
        sourceFileId:
          result.sourceFileId,
        rootSchema:
          result.rootSchema,
        archiveSha256:
          result.archiveSha256,
        rootSchemaSha256:
          result.rootSchemaSha256,
        targetDirectory:
          result.targetDirectory
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
        "ecmr-d25a-schema-install",
      code:
        typeof error?.code ===
          "string"
          ? error.code
          : "ECMR_D25A_SCHEMA_INSTALL_FAILED"
    })}\n`
  );

  process.exitCode = 1;
}
