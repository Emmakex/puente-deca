import {
  readFile
} from "node:fs/promises";

const [
  contract,
  adapter,
  validator
] = await Promise.all([
  readFile(
    "packages/contracts/src/ecmr.mjs",
    "utf8"
  ),
  readFile(
    "packages/core/src/ecmr-adapter.mjs",
    "utf8"
  ),
  readFile(
    "packages/core/src/validate-ecmr.mjs",
    "utf8"
  )
]);

for (const token of [
  'ECMR_UNCEFACT_RELEASE = "D25A"',
  'documentType: "eCMR"',
  '"UN/CEFACT eCMR"'
]) {
  if (!contract.includes(token)) {
    throw new Error(
      `eCMR contract is missing ${token}`
    );
  }
}

for (const token of [
  '"sender"',
  '"contractual_carrier"',
  '"consignee"',
  "extensions.ecmr",
  "partyRoles"
]) {
  if (!adapter.includes(token)) {
    throw new Error(
      `eCMR adapter is missing explicit-role behavior: ${token}`
    );
  }
}

if (
  /contractual_shipper[\s\S]{0,120}(sender|contractual_carrier)|effective_carrier[\s\S]{0,120}contractual_carrier/.test(
    adapter
  )
) {
  throw new Error(
    "eCMR adapter must not infer CMR legal roles from DeCA party roles"
  );
}

for (const basis of [
  "CMR_6_1_A",
  "CMR_6_1_B",
  "CMR_6_1_C",
  "CMR_6_1_D",
  "CMR_6_1_E",
  "CMR_6_1_F",
  "CMR_6_1_G",
  "CMR_6_1_H",
  "CMR_6_1_I",
  "CMR_6_1_J",
  "CMR_6_1_K",
  "ECMR_PROTOCOL_ARTICLE_3",
  "ECMR_PROTOCOL_ARTICLE_4"
]) {
  if (!validator.includes(basis)) {
    throw new Error(
      `eCMR validation is missing legal basis ${basis}`
    );
  }
}

if (
  !validator.includes(
    "validateEcmrElectronicReadiness"
  )
) {
  throw new Error(
    "eCMR Article-6 completeness must stay separate from electronic issuance readiness"
  );
}

console.log(
  "eCMR adapter contract OK (D25A pinned, explicit legal roles, Article 6 particulars, separate protocol readiness)"
);
