import test from "node:test";
import assert from "node:assert/strict";

import {
  METADATA_INDEX_CONTRACTS,
  gridFsIndexContract,
  verifyAtlasIndexContract
} from "../../../scripts/production/atlas-index-contract.mjs";

const makeDatabase = ({
  mutate = () => {}
} = {}) => {
  const contracts = [
    ...METADATA_INDEX_CONTRACTS,
    gridFsIndexContract("deca_pdf")
  ];
  const byCollection =
    new Map();

  for (const contract of contracts) {
    if (
      !byCollection.has(
        contract.collection
      )
    ) {
      byCollection.set(
        contract.collection,
        [
          {
            name: "_id_",
            key: { _id: 1 }
          }
        ]
      );
    }

    byCollection
      .get(contract.collection)
      .push({
        name: contract.name,
        key: {
          ...contract.key
        },
        ...(contract.unique
          ? { unique: true }
          : {})
      });
  }

  mutate(byCollection);

  return {
    collection(name) {
      return {
        listIndexes() {
          return {
            async toArray() {
              return (
                byCollection.get(
                  name
                ) ?? []
              );
            }
          };
        }
      };
    }
  };
};

test(
  "Atlas index contract accepts all required metadata and GridFS indexes",
  async () => {
    const result =
      await verifyAtlasIndexContract({
        database: makeDatabase(),
        bucketName: "deca_pdf"
      });

    assert.deepEqual(result, {
      metadataIndexes: 18,
      gridFsIndexes: 1
    });
  }
);

test(
  "Atlas index contract fails closed when an expected index is missing",
  async () => {
    const database =
      makeDatabase({
        mutate(byCollection) {
          const indexes =
            byCollection.get(
              "deca_shipments"
            );
          const position =
            indexes.findIndex(
              (index) =>
                index.name ===
                "shipment_id_unique"
            );
          indexes.splice(
            position,
            1
          );
        }
      });

    await assert.rejects(
      verifyAtlasIndexContract({
        database,
        bucketName: "deca_pdf"
      }),
      (error) =>
        error.code ===
        "ATLAS_INDEX_MISSING"
    );
  }
);

test(
  "Atlas index contract fails closed when uniqueness drifts",
  async () => {
    const database =
      makeDatabase({
        mutate(byCollection) {
          const index =
            byCollection
              .get(
                "deca_document_versions"
              )
              .find(
                (candidate) =>
                  candidate.name ===
                  "document_lineage_unique"
              );
          delete index.unique;
        }
      });

    await assert.rejects(
      verifyAtlasIndexContract({
        database,
        bucketName: "deca_pdf"
      }),
      (error) =>
        error.code ===
        "ATLAS_INDEX_UNIQUENESS_MISMATCH"
    );
  }
);

test(
  "Atlas index contract fails closed when key order or direction drifts",
  async () => {
    const database =
      makeDatabase({
        mutate(byCollection) {
          const index =
            byCollection
              .get(
                "deca_api_credentials"
              )
              .find(
                (candidate) =>
                  candidate.name ===
                  "credential_org_created"
              );
          index.key = {
            organizationId: 1,
            createdAt: 1
          };
        }
      });

    await assert.rejects(
      verifyAtlasIndexContract({
        database,
        bucketName: "deca_pdf"
      }),
      (error) =>
        error.code ===
        "ATLAS_INDEX_KEY_MISMATCH"
    );
  }
);
