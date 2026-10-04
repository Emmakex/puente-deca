import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile
} from "node:fs/promises";
import {
  tmpdir
} from "node:os";
import {
  join
} from "node:path";

import {
  createSchemaTreeEvidence
} from "../src/schema-integrity.mjs";
import {
  validateEcmrD25aXmlFile
} from "../src/schema-validation.mjs";
import {
  ECMR_D25A_PROFILE
} from "../src/d25a-profile.mjs";
import {
  sha256File
} from "../src/schema-integrity.mjs";

const fixture = async () => {
  const root =
    await mkdtemp(
      join(
        tmpdir(),
        "pdeca-ecmr-validation-"
      )
    );
  const schemaDirectory =
    join(
      root,
      "schema"
    );
  const schemaRoot =
    join(
      schemaDirectory,
      ECMR_D25A_PROFILE
        .rootSchema
    );

  await Promise.all([
    mkdir(
      join(
        schemaDirectory,
        "uncefact"
      ),
      {
        recursive: true
      }
    ),
    mkdir(
      join(
        schemaDirectory,
        "common"
      ),
      {
        recursive: true
      }
    )
  ]);

  const schema =
    '<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"/>';
  const importedSchema =
    join(
      schemaDirectory,
      "common",
      "Reusable.xsd"
    );

  await Promise.all([
    writeFile(
      schemaRoot,
      schema
    ),
    writeFile(
      importedSchema,
      schema
    )
  ]);

  const tree =
    await createSchemaTreeEvidence(
      schemaDirectory
    );

  await writeFile(
    join(
      schemaDirectory,
      "pdeca-manifest.json"
    ),
    JSON.stringify({
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
        ECMR_D25A_PROFILE
          .nestedSchemaArchive,
      rootSchema:
        ECMR_D25A_PROFILE
          .rootSchema,
      archiveSha256:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      nestedSchemaArchiveSha256:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      rootSchemaSha256:
        await sha256File(
          schemaRoot
        ),
      schemaFileCount:
        tree.schemaFileCount,
      schemaTreeSha256:
        tree.schemaTreeSha256,
      schemaFiles:
        tree.schemaFiles
    })
  );

  const xml =
    join(
      root,
      "document.xml"
    );

  await writeFile(
    xml,
    "<eCMR/>"
  );

  return {
    root,
    schemaDirectory,
    schemaRoot,
    importedSchema,
    xml
  };
};

test(
  "runs xmllint in offline mode and returns complete acceptance hashes",
  async () => {
    const {
      schemaDirectory,
      xml
    } = await fixture();
    let observed = null;

    const result =
      await validateEcmrD25aXmlFile({
        xmlPath: xml,
        schemaDirectory,
        spawn: (
          command,
          args
        ) => {
          observed = {
            command,
            args
          };

          return {
            status: 0,
            stdout: "",
            stderr: ""
          };
        }
      });

    assert.equal(
      result.valid,
      true
    );
    assert.equal(
      observed.command,
      "xmllint"
    );
    assert.deepEqual(
      observed.args.slice(
        0,
        2
      ),
      [
        "--nonet",
        "--noout"
      ]
    );
    assert.ok(
      observed.args.includes(
        "--schema"
      )
    );
    assert.match(
      result.xmlSha256,
      /^sha256:[0-9a-f]{64}$/
    );
    assert.match(
      result.schemaTreeSha256,
      /^sha256:[0-9a-f]{64}$/
    );
    assert.equal(
      result.schemaFileCount,
      2
    );
    assert.equal(
      result.networkAccess,
      false
    );
  }
);

test(
  "fails closed when xmllint is unavailable",
  async () => {
    const {
      schemaDirectory,
      xml
    } = await fixture();

    await assert.rejects(
      () =>
        validateEcmrD25aXmlFile({
          xmlPath: xml,
          schemaDirectory,
          spawn: () => ({
            status: null,
            error: {
              code:
                "ENOENT"
            }
          })
        }),
      (error) =>
        error.code ===
        "ECMR_D25A_XMLLINT_REQUIRED"
    );
  }
);

test(
  "fails closed on official schema validation errors",
  async () => {
    const {
      schemaDirectory,
      xml
    } = await fixture();

    await assert.rejects(
      () =>
        validateEcmrD25aXmlFile({
          xmlPath: xml,
          schemaDirectory,
          spawn: () => ({
            status: 3,
            stdout: "",
            stderr:
              "document.xml:1: schema error"
          })
        }),
      (error) =>
        error.code ===
          "ECMR_D25A_SCHEMA_VALIDATION_FAILED" &&
        error.validationOutput
          .length === 1
    );
  }
);

test(
  "fails closed if an imported schema changes after manifest creation",
  async () => {
    const {
      schemaDirectory,
      importedSchema,
      xml
    } = await fixture();

    await writeFile(
      importedSchema,
      '<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"><!-- tampered imported schema --></xsd:schema>'
    );

    await assert.rejects(
      () =>
        validateEcmrD25aXmlFile({
          xmlPath: xml,
          schemaDirectory,
          spawn: () => ({
            status: 0,
            stdout: "",
            stderr: ""
          })
        }),
      (error) =>
        [
          "ECMR_D25A_SCHEMA_TREE_HASH_MISMATCH",
          "ECMR_D25A_SCHEMA_FILE_HASH_MISMATCH"
        ].includes(
          error.code
        )
    );
  }
);
