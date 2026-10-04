import {
  readFile
} from "node:fs/promises";

const [
  jsonStore,
  mongoStore,
  atlasIndexes,
  restore
] = await Promise.all([
  readFile(
    "packages/persistence/src/json-store.mjs",
    "utf8"
  ),
  readFile(
    "packages/persistence/src/mongo-store.mjs",
    "utf8"
  ),
  readFile(
    "scripts/production/atlas-index-contract.mjs",
    "utf8"
  ),
  readFile(
    "scripts/production/restore-drill.mjs",
    "utf8"
  )
]);

for (
  const [
    name,
    source
  ] of [
    [
      "JsonStore",
      jsonStore
    ],
    [
      "MongoStore",
      mongoStore
    ]
  ]
) {
  for (const token of [
    "appendEcmrAmendmentVersion",
    "listEcmrAmendmentVersions",
    "verifyEcmrAmendmentChain",
    "ECMR_AMENDMENT_VERSION_EXISTS",
    "ECMR_AMENDMENT_LINEAGE_CONFLICT",
    "ecmr.amendment.version.created"
  ]) {
    if (!source.includes(token)) {
      throw new Error(
        `${name} eCMR amendment persistence is missing ${token}`
      );
    }
  }
}

for (const token of [
  '"deca_ecmr_amendment_versions"',
  "ecmr_amendment_version_id_unique",
  "ecmr_amendment_lineage_unique",
  "ECMR_AMENDMENT_CONFLICT",
  "withTransaction"
]) {
  if (!mongoStore.includes(token)) {
    throw new Error(
      `MongoStore amendment persistence is missing ${token}`
    );
  }
}

if (
  /collection\(\s*"ecmr_amendment_versions"/.test(
    mongoStore
  )
) {
  throw new Error(
    "eCMR amendment persistence must stay inside the deca_* Atlas namespace"
  );
}

for (const token of [
  'collection: "deca_ecmr_amendment_versions"',
  'name: "ecmr_amendment_version_id_unique"',
  'name: "ecmr_amendment_lineage_unique"'
]) {
  if (!atlasIndexes.includes(token)) {
    throw new Error(
      `Atlas index contract is missing ${token}`
    );
  }
}

if (
  !restore.includes(
    '"deca_ecmr_amendment_versions"'
  )
) {
  throw new Error(
    "DR restore must require eCMR amendment history"
  );
}

console.log(
  "eCMR amendment persistence contract OK (Json/Mongo parity, deca_* namespace, transaction+audit, unique lineage, DR inclusion)"
);
