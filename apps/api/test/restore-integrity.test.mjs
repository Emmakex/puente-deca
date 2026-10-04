import test from "node:test";
import assert from "node:assert/strict";

import {
  assertRestoreReconciliation,
  assertRestoredArtifactLink
} from "../../../scripts/production/restore-integrity.mjs";

test(
  "restore reconciliation accepts a zero-anomaly metadata/GridFS state",
  () => {
    assert.deepEqual(
      assertRestoreReconciliation({
        counts: {
          references: 3,
          storedArtifacts: 2,
          purgeRecords: 1,
          missingBeforeRetention: 0,
          missingAfterRetention: 0,
          orphanedArtifacts: 0,
          purgedArtifactsStillPresent: 0
        }
      }),
      {
        references: 3,
        storedArtifacts: 2,
        purgeRecords: 1,
        missingBeforeRetention: 0,
        missingAfterRetention: 0,
        orphanedArtifacts: 0,
        purgedArtifactsStillPresent: 0
      }
    );
  }
);

test(
  "restore reconciliation fails closed on metadata/GridFS anomalies",
  () => {
    assert.throws(
      () =>
        assertRestoreReconciliation({
          counts: {
            references: 2,
            storedArtifacts: 1,
            purgeRecords: 0,
            missingBeforeRetention: 1,
            missingAfterRetention: 0,
            orphanedArtifacts: 0,
            purgedArtifactsStillPresent: 0
          }
        }),
      (error) =>
        error.code ===
        "RESTORE_RECONCILIATION_FAILED" &&
        error.anomalies
          .missingBeforeRetention === 1
    );
  }
);

test(
  "restored artifact link accepts matching document and GridFS evidence",
  () => {
    assert.deepEqual(
      assertRestoredArtifactLink({
        file: {
          filename: "doc_1.pdf",
          metadata: {
            documentId: "doc_1",
            sha256:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            size: 123
          }
        },
        reference: {
          storageKey: "doc_1.pdf",
          documentId: "doc_1",
          sha256:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          size: 123
        },
        actualSha256:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        actualBytes: 123
      }),
      {
        storageKey:
          "doc_1.pdf",
        documentId:
          "doc_1",
        sha256:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        bytes: 123
      }
    );
  }
);

test(
  "restored artifact link rejects document metadata SHA drift",
  () => {
    assert.throws(
      () =>
        assertRestoredArtifactLink({
          file: {
            filename:
              "doc_1.pdf",
            metadata: {
              documentId:
                "doc_1",
              sha256:
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              size: 123
            }
          },
          reference: {
            storageKey:
              "doc_1.pdf",
            documentId:
              "doc_1",
            sha256:
              "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            size: 123
          },
          actualSha256:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          actualBytes: 123
        }),
      (error) =>
        error.code ===
        "RESTORE_ARTIFACT_REFERENCE_SHA_MISMATCH"
    );
  }
);

test(
  "restored artifact link rejects GridFS document-ID drift",
  () => {
    assert.throws(
      () =>
        assertRestoredArtifactLink({
          file: {
            filename:
              "doc_1.pdf",
            metadata: {
              documentId:
                "doc_other",
              sha256:
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              size: 123
            }
          },
          reference: {
            storageKey:
              "doc_1.pdf",
            documentId:
              "doc_1",
            sha256:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            size: 123
          },
          actualSha256:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          actualBytes: 123
        }),
      (error) =>
        error.code ===
        "RESTORE_ARTIFACT_DOCUMENT_ID_MISMATCH"
    );
  }
);
