import {
  createHash
} from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import {
  dirname,
  resolve
} from "node:path";
import {
  canonicalJson
} from "../../packages/core/src/canonical-json.mjs";
import {
  serializeEcmrD25aEnvelope
} from "../../packages/ecmr-xml/src/d25a-serializer.mjs";
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
    const error =
      new Error(
        `${name} is required`
      );
    error.code =
      "ECMR_D25A_ACCEPTANCE_CONFIGURATION_INVALID";
    throw error;
  }

  return value.trim();
};

const sha256 = (
  value
) =>
  `sha256:${createHash("sha256")
    .update(value)
    .digest("hex")}`;

const projectionPath =
  resolve(
    requireText(
      process.env
        .ECMR_D25A_PROJECTION,
      "ECMR_D25A_PROJECTION"
    )
  );

const schemaDirectory =
  resolve(
    process.env
      .ECMR_D25A_SCHEMA_DIR ??
      "vendor/uncefact/ecmr/D25A"
  );

const evidencePath =
  resolve(
    requireText(
      process.env
        .ECMR_D25A_EVIDENCE,
      "ECMR_D25A_EVIDENCE"
    )
  );

const xmlPath =
  `${evidencePath}.xml.tmp-${process.pid}`;
const evidenceTemp =
  `${evidencePath}.tmp-${process.pid}`;

try {
  const projection =
    JSON.parse(
      await readFile(
        projectionPath,
        "utf8"
      )
    );
  const wire =
    serializeEcmrD25aEnvelope(
      projection
    );

  await mkdir(
    dirname(
      evidencePath
    ),
    {
      recursive: true
    }
  );

  await writeFile(
    xmlPath,
    wire.xml,
    "utf8"
  );

  const validation =
    await validateEcmrD25aXmlFile({
      xmlPath,
      schemaDirectory
    });

  const coreEvidence = {
    evidenceVersion: 1,
    status: "pass",
    check:
      "ecmr-d25a-generated-xml-acceptance",
    generatedAt:
      new Date()
        .toISOString(),
    projectionSha256:
      sha256(
        Buffer.from(
          canonicalJson(
            projection
          ),
          "utf8"
        )
      ),
    serializer: {
      release:
        wire.release,
      rootSchema:
        wire.rootSchema,
      mappedProjectionPaths:
        wire
          .mappedProjectionPaths,
      pendingProjectionPaths:
        wire
          .pendingProjectionPaths
    },
    validation: {
      schemaConformance:
        "official-d25a-xsd-pass",
      release:
        validation.release,
      sourceFile:
        validation.sourceFile,
      sourceFileId:
        validation.sourceFileId,
      archiveSha256:
        validation.archiveSha256,
      nestedSchemaArchive:
        validation
          .nestedSchemaArchive,
      nestedSchemaArchiveSha256:
        validation
          .nestedSchemaArchiveSha256,
      rootSchema:
        validation.rootSchema,
      rootSchemaSha256:
        validation
          .rootSchemaSha256,
      schemaFileCount:
        validation
          .schemaFileCount,
      schemaTreeSha256:
        validation
          .schemaTreeSha256,
      xmlSha256:
        validation.xmlSha256,
      networkAccess:
        validation
          .networkAccess
    }
  };

  const evidence = {
    ...coreEvidence,
    evidenceSha256:
      sha256(
        Buffer.from(
          canonicalJson(
            coreEvidence
          ),
          "utf8"
        )
      )
  };

  await writeFile(
    evidenceTemp,
    `${JSON.stringify(
      evidence,
      null,
      2
    )}\n`,
    "utf8"
  );
  await rename(
    evidenceTemp,
    evidencePath
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          evidence.check,
        evidencePath,
        evidenceSha256:
          evidence
            .evidenceSha256,
        xmlSha256:
          evidence
            .validation
            .xmlSha256,
        schemaTreeSha256:
          evidence
            .validation
            .schemaTreeSha256,
        schemaConformance:
          evidence
            .validation
            .schemaConformance
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
        "ecmr-d25a-generated-xml-acceptance",
      code:
        typeof error?.code ===
          "string"
          ? error.code
          : "ECMR_D25A_ACCEPTANCE_FAILED",
      validationOutput:
        Array.isArray(
          error
            ?.validationOutput
        )
          ? error
              .validationOutput
          : undefined
    })}\n`
  );

  process.exitCode = 1;
} finally {
  await Promise.all([
    rm(
      xmlPath,
      {
        force: true
      }
    ),
    rm(
      evidenceTemp,
      {
        force: true
      }
    )
  ]);
}
