import {
  readFile
} from "node:fs/promises";

const [
  profile,
  serializer,
  bundle,
  validator,
  installCli,
  validateCli
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
  )
]);

for (const token of [
  'release: "D25A"',
  'sourceFileName:',
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
  "archiveSha256",
  "rootSchemaSha256",
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
  '"xmllint"',
  '"--nonet"',
  '"--noout"',
  '"--schema"',
  "ECMR_D25A_XMLLINT_REQUIRED",
  "ECMR_D25A_SCHEMA_VALIDATION_FAILED"
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

console.log(
  "eCMR D25A XML boundary OK (official package pinned, Article 6 projection fields mapped without inference, local schema manifest/hash, xmllint --nonet fail-closed validation)"
);
