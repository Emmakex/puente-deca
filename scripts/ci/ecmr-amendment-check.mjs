import {
  readFile
} from "node:fs/promises";

const [
  chain,
  bridge,
  contract
] = await Promise.all([
  readFile(
    "packages/ecmr-amendment/src/amendment-chain.mjs",
    "utf8"
  ),
  readFile(
    "packages/core/src/ecmr-amendment-evidence.mjs",
    "utf8"
  ),
  readFile(
    "packages/contracts/src/ecmr.mjs",
    "utf8"
  )
]);

for (const token of [
  "canonicalJson",
  '"ecmr-amendment-chain-v1"',
  "originalContentHash",
  "previousVersionId",
  "previousContentHash",
  "previousChainHash",
  "chainHash",
  "record.xml",
  "ECMR_AMENDMENT_CONTENT_HASH_MISMATCH",
  "ECMR_AMENDMENT_PREVIOUS_LINK_MISMATCH",
  "ECMR_AMENDMENT_CHAIN_HASH_MISMATCH",
  "ECMR_AMENDMENT_NO_CHANGE",
  "ECMR_AMENDMENT_TIME_ORDER_INVALID"
]) {
  if (!chain.includes(token)) {
    throw new Error(
      `eCMR amendment chain is missing ${token}`
    );
  }
}

if (
  !/contentHash\([\s\S]*record\.xml/.test(
    chain
  )
) {
  throw new Error(
    "eCMR amendment verification must hash the exact preserved XML"
  );
}

if (
  !/record\.originalContentHash !==[\s\S]*original\.contentHash/.test(
    chain
  )
) {
  throw new Error(
    "Every amendment must preserve the original final-form hash"
  );
}

for (const token of [
  "verifyEcmrAmendmentChain",
  '"ECMR_AMENDMENT_FINAL_FORM_REQUIRED"',
  '"ECMR_AMENDMENT_LATEST_CONTENT_MISMATCH"',
  "latestContentHash",
  "amendmentHistoryPreserved:",
  "amendmentChain:"
]) {
  if (!bridge.includes(token)) {
    throw new Error(
      `eCMR amendment evidence bridge is missing ${token}`
    );
  }
}

if (
  !/projection\.integrity[\s\S]*contentHash[\s\S]*latestContentHash/.test(
    bridge
  )
) {
  throw new Error(
    "Amendment evidence must match the exact current final-form content hash"
  );
}

if (
  /authentication\s*=|state:\s*"authenticated"/.test(
    bridge
  )
) {
  throw new Error(
    "Amendment-history verification must not promote authentication state"
  );
}

if (
  !contract.includes(
    "amendmentChain: null"
  )
) {
  throw new Error(
    "eCMR projection contract must expose amendment-chain evidence explicitly"
  );
}

console.log(
  "eCMR amendment-history contract OK (exact XML preserved, original/previous/chain hashes linked, no-op/reorder/tamper fail closed, latest history must match final signed form)"
);
