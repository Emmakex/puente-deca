const metadataIndexContracts = [
  {
    collection: "deca_organizations",
    name: "organization_id_unique",
    key: { organizationId: 1 },
    unique: true
  },
  {
    collection: "deca_api_credentials",
    name: "credential_id_unique",
    key: { credentialId: 1 },
    unique: true
  },
  {
    collection: "deca_api_credentials",
    name: "credential_key_hash_unique",
    key: { keyHash: 1 },
    unique: true
  },
  {
    collection: "deca_api_credentials",
    name: "credential_org_created",
    key: { organizationId: 1, createdAt: -1 },
    unique: false
  },
  {
    collection: "deca_ecmr_signer_keys",
    name: "ecmr_signer_key_id_unique",
    key: { signerKeyId: 1 },
    unique: true
  },
  {
    collection: "deca_ecmr_signer_keys",
    name: "ecmr_signer_org_fingerprint_unique",
    key: {
      organizationId: 1,
      publicKeyFingerprint: 1
    },
    unique: true
  },
  {
    collection: "deca_ecmr_signer_keys",
    name: "ecmr_signer_org_created",
    key: {
      organizationId: 1,
      createdAt: -1,
      signerKeyId: -1
    },
    unique: false
  },
  {
    collection: "deca_shipments",
    name: "shipment_id_unique",
    key: { shipmentId: 1 },
    unique: true
  },
  {
    collection: "deca_shipments",
    name: "shipment_org_updated",
    key: { organizationId: 1, updatedAt: -1 },
    unique: false
  },
  {
    collection: "deca_document_versions",
    name: "document_id_unique",
    key: { documentId: 1 },
    unique: true
  },
  {
    collection: "deca_document_versions",
    name: "document_lineage_unique",
    key: { shipmentId: 1, version: 1 },
    unique: true
  },
  {
    collection: "deca_document_versions",
    name: "document_access_path_unique",
    key: { accessPath: 1 },
    unique: true
  },
  {
    collection: "deca_document_versions",
    name: "document_retention_floor",
    key: {
      "artifact.retentionNotBefore": 1,
      documentId: 1
    },
    unique: false
  },
  {
    collection: "deca_regulatory_versions",
    name: "regulatory_version_id_unique",
    key: { versionId: 1 },
    unique: true
  },
  {
    collection: "deca_regulatory_versions",
    name: "regulatory_lineage_unique",
    key: {
      organizationId: 1,
      shipmentId: 1,
      regulatoryType: 1,
      version: 1
    },
    unique: true
  },
  {
    collection: "deca_regulatory_versions",
    name: "regulatory_shipment_created",
    key: {
      organizationId: 1,
      shipmentId: 1,
      regulatoryType: 1,
      createdAt: 1,
      versionId: 1
    },
    unique: false
  },
  {
    collection: "deca_idempotency",
    name: "idempotency_scope_unique",
    key: { scope: 1 },
    unique: true
  },
  {
    collection: "deca_audit_events",
    name: "audit_org_at",
    key: { organizationId: 1, at: 1, eventId: 1 },
    unique: false
  },
  {
    collection: "deca_audit_events",
    name: "audit_shipment_at",
    key: { organizationId: 1, shipmentId: 1, at: 1 },
    unique: false
  },
  {
    collection: "deca_artifact_purges",
    name: "artifact_purge_document_unique",
    key: { documentId: 1 },
    unique: true
  },
  {
    collection: "deca_artifact_purges",
    name: "artifact_purge_storage_unique",
    key: { storageKey: 1 },
    unique: true
  },
  {
    collection: "deca_artifact_purges",
    name: "artifact_purge_at",
    key: { purgedAt: 1 },
    unique: false
  }
];

export const METADATA_INDEX_CONTRACTS =
  Object.freeze(
    metadataIndexContracts.map(
      (contract) =>
        Object.freeze({
          ...contract,
          key: Object.freeze({
            ...contract.key
          })
        })
    )
  );

export const gridFsIndexContract = (
  bucketName
) => ({
  collection: `${bucketName}.files`,
  name: "deca_pdf_filename_unique",
  key: { filename: 1 },
  unique: true
});

const indexFailure = (
  code,
  contract
) =>
  Object.assign(
    new Error(
      `MongoDB index contract failed for ${contract.collection}/${contract.name}`
    ),
    { code }
  );

const keysMatch = (
  actual,
  expected
) => {
  const actualEntries =
    Object.entries(actual ?? {});
  const expectedEntries =
    Object.entries(expected);

  return (
    actualEntries.length ===
      expectedEntries.length &&
    expectedEntries.every(
      ([key, direction], index) =>
        actualEntries[index]?.[0] ===
          key &&
        actualEntries[index]?.[1] ===
          direction
    )
  );
};

export async function verifyAtlasIndexContract({
  database,
  bucketName
}) {
  if (
    !database ||
    typeof database.collection !==
      "function"
  ) {
    throw new TypeError(
      "database is required"
    );
  }

  if (
    typeof bucketName !== "string" ||
    bucketName.trim().length === 0
  ) {
    throw new TypeError(
      "bucketName is required"
    );
  }

  const gridFsContract =
    gridFsIndexContract(
      bucketName.trim()
    );
  const contracts = [
    ...METADATA_INDEX_CONTRACTS,
    gridFsContract
  ];
  const cachedIndexes =
    new Map();

  for (const contract of contracts) {
    let indexes =
      cachedIndexes.get(
        contract.collection
      );

    if (!indexes) {
      indexes = await database
        .collection(
          contract.collection
        )
        .listIndexes()
        .toArray();

      cachedIndexes.set(
        contract.collection,
        indexes
      );
    }

    const index = indexes.find(
      (candidate) =>
        candidate.name ===
        contract.name
    );

    if (!index) {
      throw indexFailure(
        "ATLAS_INDEX_MISSING",
        contract
      );
    }

    if (
      !keysMatch(
        index.key,
        contract.key
      )
    ) {
      throw indexFailure(
        "ATLAS_INDEX_KEY_MISMATCH",
        contract
      );
    }

    if (
      Boolean(index.unique) !==
        contract.unique
    ) {
      throw indexFailure(
        "ATLAS_INDEX_UNIQUENESS_MISMATCH",
        contract
      );
    }
  }

  return {
    metadataIndexes:
      METADATA_INDEX_CONTRACTS.length,
    gridFsIndexes: 1
  };
}
