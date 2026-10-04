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
  createHash
} from "node:crypto";

import {
  validateEcmrD25aXmlFile
} from "../src/schema-validation.mjs";
import {
  ECMR_D25A_PROFILE
} from "../src/d25a-profile.mjs";

const sha = (
  value
) =>
  `sha256:${createHash("sha256")
    .update(value)
    .digest("hex")}`;

const fixture = async () => {
  const root =
    await mkdtemp(
      join(
        tmpdir(),
        "pdeca-ecmr-validation-"
      )
    );
  const schemaRoot =
    join(
      root,
      ECMR_D25A_PROFILE
        .rootSchema
    );

  await mkdir(
    join(
      root,
      "uncefact"
    ),
    {
      recursive: true
    }
  );

  const schema =
    '<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"/>';
  await writeFile(
    schemaRoot,
    schema
  );
  await writeFile(
    join(
      root,
      "pdeca-manifest.json"
    ),
    JSON.stringify({
      schemaVersion: 1,
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
        "sha256:fixture",
      rootSchemaSha256:
        sha(schema)
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
    xml
  };
};

test(
  "runs xmllint in offline mode against the pinned root schema",
  async () => {
    const {
      root,
      xml
    } = await fixture();
    let observed = null;

    const result =
      await validateEcmrD25aXmlFile({
        xmlPath: xml,
        schemaDirectory:
          root,
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
  }
);

test(
  "fails closed when xmllint is unavailable",
  async () => {
    const {
      root,
      xml
    } = await fixture();

    await assert.rejects(
      () =>
        validateEcmrD25aXmlFile({
          xmlPath: xml,
          schemaDirectory:
            root,
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
      root,
      xml
    } = await fixture();

    await assert.rejects(
      () =>
        validateEcmrD25aXmlFile({
          xmlPath: xml,
          schemaDirectory:
            root,
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
