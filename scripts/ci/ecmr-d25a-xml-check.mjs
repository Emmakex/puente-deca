import {
  spawnSync
} from "node:child_process";
import {
  readFile
} from "node:fs/promises";

const [
  profile,
  serializer,
  bundle,
  integrity,
  validator,
  installCli,
  validateCli,
  acceptanceCli,
  verifyEvidenceCli,
  officialAcceptanceWorkflow,
  acceptanceProjection
] = await Promise.all([
  readFile(
    "packages/ecmr-xml/src/d25a-profile.mjs",
    "utf8"
  ),
  readFile(
    "packages/ecmr-xml/src/d25a-serializer.mjs",
    "utf8"
  ),
  readFile(
    "packages/ecmr-xml/src/schema-bundle.mjs",
    "utf8"
  ),
  readFile(
    "packages/ecmr-xml/src/schema-integrity.mjs",
    "utf8"
  ),
  readFile(
    "packages/ecmr-xml/src/schema-validation.mjs",
    "utf8"
  ),
  readFile(
    "scripts/production/install-ecmr-d25a-schema.mjs",
    "utf8"
  ),
  readFile(
    "scripts/production/validate-ecmr-d25a-xml.mjs",
    "utf8"
  ),
  readFile(
    "scripts/production/ecmr-d25a-acceptance.mjs",
    "utf8"
  ),
  readFile(
    "scripts/production/verify-ecmr-d25a-evidence.mjs",
    "utf8"
  ),
  readFile(
    ".github/workflows/ecmr-d25a-official-acceptance.yml",
    "utf8"
  ),
  readFile(
    "examples/ecmr/d25a-acceptance-projection.json",
    "utf8"
  )
]);

for (const token of [
  'release: "D25A"',
  'sourceFileName:',
  'sourceDownload:',
  '"https://unece.org/sites/default/files/2026-06/eCMR_D25A.zip"',
  '"eCMR_D25A.zip"',
  "sourceFileId: 473769",
  '"XSD/Schema.zip"',
  '"uncefact/eCMR_100pD25A.xsd"',
  '"urn:un:unece:uncefact:data:standard:eCMR:100"'
]) {
  if (!profile.includes(token)) {
    throw new Error(
      `D25A profile is missing ${token}`
    );
  }
}

for (const token of [
  "validateEcmrProjection",
  "pending-official-xsd-validation",
  "<rsm:eCMR",
  "SpecifiedSupplyChainConsignment",
  "ConsignorTradeParty",
  "CarrierTradeParty",
  "ConsigneeTradeParty",
  "CarrierAcceptanceLogisticsLocation",
  "ConsigneeReceiptLogisticsLocation",
  "PickUpTransportEvent",
  "ActualOccurrenceDateTime",
  "IncludedSupplyChainConsignmentItem",
  "NatureIdentificationTransportCargo",
  "TransportLogisticsPackage",
  "PhysicalLogisticsShippingMarks",
  "Marking",
  "ApplicableLogisticsServiceCharge",
  "AppliedAmount",
  "currencyID",
  "ApplicableTransportDangerousGoods",
  "UNDGIdentificationCode",
  "ProperShippingName",
  "RegulationCode",
  "HazardClassificationID",
  "goods.packingMethod",
  "goods.packingMethodCode",
  "projection.charges",
  "TypeText",
  "ConsignorProvidedBorderClearanceTransportInstructions",
  "ContractualDocumentClause",
  "borderClearanceInstructions",
  "cmrContractualClause",
  ".customsFormalities",
  ".conventionApplicability"
]) {
  if (!serializer.includes(token)) {
    throw new Error(
      `D25A serializer is missing ${token}`
    );
  }
}

for (const token of [
  "safeEntries",
  "schemaVersion: 2",
  "archiveSha256",
  "nestedSchemaArchiveSha256",
  "rootSchemaSha256",
  "schemaFileCount",
  "schemaTreeSha256",
  "schemaFiles",
  "verifySchemaTreeEvidence",
  "pdeca-manifest.json",
  "ECMR_D25A_ROOT_SCHEMA_HASH_MISMATCH"
]) {
  if (!bundle.includes(token)) {
    throw new Error(
      `D25A schema bundle guard is missing ${token}`
    );
  }
}

for (const token of [
  "createSchemaTreeEvidence",
  "verifySchemaTreeEvidence",
  "ECMR_D25A_SCHEMA_TREE_EVIDENCE_MISSING",
  "ECMR_D25A_SCHEMA_TREE_HASH_MISMATCH",
  "ECMR_D25A_SCHEMA_FILE_HASH_MISMATCH"
]) {
  if (!integrity.includes(token)) {
    throw new Error(
      `D25A schema tree integrity guard is missing ${token}`
    );
  }
}

for (const token of [
  '"xmllint"',
  '"--nonet"',
  '"--noout"',
  '"--schema"',
  "ECMR_D25A_XMLLINT_REQUIRED",
  "ECMR_D25A_SCHEMA_VALIDATION_FAILED",
  "xmlSha256",
  "schemaTreeSha256",
  "nestedSchemaArchiveSha256"
]) {
  if (!validator.includes(token)) {
    throw new Error(
      `D25A schema validator is missing ${token}`
    );
  }
}

if (
  /https?:\/\//.test(
    validator
  )
) {
  throw new Error(
    "eCMR D25A validation must not fetch remote schemas"
  );
}

if (
  !installCli.includes(
    "ECMR_D25A_ARCHIVE"
  ) ||
  !installCli.includes(
    "ECMR_D25A_SCHEMA_REPLACE"
  )
) {
  throw new Error(
    "D25A installer must require an explicit local official archive and guarded replacement"
  );
}

if (
  !validateCli.includes(
    "ECMR_D25A_XML"
  )
) {
  throw new Error(
    "D25A validation CLI must require an explicit XML file"
  );
}

for (const token of [
  "ECMR_D25A_PROJECTION",
  "ECMR_D25A_EVIDENCE",
  "serializeEcmrD25aEnvelope",
  "validateEcmrD25aXmlFile",
  "official-d25a-xsd-pass",
  "projectionSha256",
  "evidenceSha256",
  "schemaTreeSha256",
  "xmlSha256"
]) {
  if (!acceptanceCli.includes(token)) {
    throw new Error(
      `D25A generated-XML acceptance command is missing ${token}`
    );
  }
}

for (const token of [
  "ECMR_D25A_EVIDENCE_HASH_MISMATCH",
  "ECMR_D25A_EVIDENCE_PROJECTION_MISMATCH",
  "ECMR_D25A_EVIDENCE_XML_MISMATCH",
  "ECMR_D25A_EVIDENCE_SCHEMA_MISMATCH",
  "readEcmrD25aSchemaManifest",
  "serializeEcmrD25aEnvelope",
  "schemaTreeSha256"
]) {
  if (!verifyEvidenceCli.includes(token)) {
    throw new Error(
      `D25A acceptance evidence verifier is missing ${token}`
    );
  }
}

for (const token of [
  "ecmr-d25a-official-acceptance",
  "workflow_dispatch:",
  "self-hosted",
  "inputs.runner",
  "https://unece.org/sites/default/files/2026-06/eCMR_D25A.zip",
  "XSD/Schema.zip",
  "ecmr:d25a:schema-install",
  "production:ecmr-d25a-acceptance",
  "production:ecmr-d25a-evidence-verify",
  "actions/upload-artifact@v4",
  "acceptance-evidence.json",
  "schema-manifest.json"
]) {
  if (!officialAcceptanceWorkflow.includes(token)) {
    throw new Error(
      `Official D25A acceptance workflow is missing ${token}`
    );
  }
}

if (
  /SKIP_|BYPASS_|continue-on-error:\s*true/i.test(
    officialAcceptanceWorkflow
  )
) {
  throw new Error(
    "Official D25A acceptance workflow must fail closed without skip/bypass controls"
  );
}

const acceptanceFixture =
  JSON.parse(
    acceptanceProjection
  );

if (
  acceptanceFixture
    .messageRelease !==
      "D25A" ||
  acceptanceFixture
    .documentType !==
      "eCMR"
) {
  throw new Error(
    "D25A acceptance projection must be a canonical structured eCMR D25A fixture"
  );
}

for (const mappedPath of [
  '"takingOver.date"',
  '"goods.nature"',
  '"goods.packages.marksAndNumbers"',
  '"goods.packingMethod"',
  '"customsFormalities"',
  '"conventionApplicability"'
]) {
  if (!serializer.includes(mappedPath)) {
    throw new Error(
      `D25A serializer mapping evidence is missing ${mappedPath}`
    );
  }
}

for (const stillPending of [
  '"goods.dangerousGoodsDescription"',
  '"authentication"',
  '"integrity"'
]) {
  if (!serializer.includes(stillPending)) {
    throw new Error(
      `D25A serializer must keep ambiguous field pending: ${stillPending}`
    );
  }
}

for (const path of [
  "packages/ecmr-xml/src/schema-integrity.mjs",
  "packages/ecmr-xml/src/schema-bundle.mjs",
  "packages/ecmr-xml/src/schema-validation.mjs",
  "scripts/production/ecmr-d25a-acceptance.mjs",
  "scripts/production/verify-ecmr-d25a-evidence.mjs"
]) {
  const parsed =
    spawnSync(
      process.execPath,
      [
        "--check",
        path
      ],
      {
        encoding: "utf8"
      }
    );

  if (
    parsed.status !==
      0
  ) {
    throw new Error(
      `D25A acceptance source failed syntax check: ${path}\n${parsed.stderr ?? ""}`
    );
  }
}

console.log(
  "eCMR D25A XML boundary OK (official package pinned, full schema-tree integrity manifest, generated-XML acceptance evidence, xmllint --nonet fail-closed validation)"
);
