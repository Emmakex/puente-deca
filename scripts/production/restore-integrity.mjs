const anomalyKeys = [
  "missingBeforeRetention",
  "missingAfterRetention",
  "orphanedArtifacts",
  "purgedArtifactsStillPresent"
];

const failure = (
  code,
  message,
  extra = {}
) =>
  Object.assign(
    new Error(message),
    {
      code,
      ...extra
    }
  );

export function assertRestoreReconciliation(
  report
) {
  const counts =
    report?.counts;

  if (
    !counts ||
    typeof counts !== "object"
  ) {
    throw failure(
      "RESTORE_RECONCILIATION_INVALID",
      "Restore reconciliation did not return counts"
    );
  }

  const anomalies =
    Object.fromEntries(
      anomalyKeys
        .map(
          (key) => [
            key,
            Number(
              counts[key] ?? 0
            )
          ]
        )
        .filter(
          ([, value]) =>
            !Number.isFinite(value) ||
            value !== 0
        )
    );

  if (
    Object.keys(anomalies)
      .length > 0
  ) {
    throw failure(
      "RESTORE_RECONCILIATION_FAILED",
      "Restored metadata and GridFS are not reconciled",
      { anomalies }
    );
  }

  const references =
    Number(counts.references ?? 0);
  const storedArtifacts =
    Number(
      counts.storedArtifacts ?? 0
    );
  const purgeRecords =
    Number(
      counts.purgeRecords ?? 0
    );

  if (
    !Number.isInteger(references) ||
    references < 1 ||
    !Number.isInteger(
      storedArtifacts
    ) ||
    storedArtifacts < 1 ||
    !Number.isInteger(
      purgeRecords
    ) ||
    purgeRecords < 0
  ) {
    throw failure(
      "RESTORE_RECONCILIATION_INVALID",
      "Restore reconciliation counts are invalid"
    );
  }

  return {
    references,
    storedArtifacts,
    purgeRecords,
    missingBeforeRetention: 0,
    missingAfterRetention: 0,
    orphanedArtifacts: 0,
    purgedArtifactsStillPresent: 0
  };
}

export function assertRestoredArtifactLink({
  file,
  reference,
  actualSha256,
  actualBytes
}) {
  const storageKey =
    file?.filename;

  if (
    typeof storageKey !== "string" ||
    storageKey.length === 0 ||
    !reference
  ) {
    throw failure(
      "RESTORE_ARTIFACT_REFERENCE_MISSING",
      "Restored GridFS artifact has no document-version reference"
    );
  }

  if (
    reference.storageKey !==
      storageKey
  ) {
    throw failure(
      "RESTORE_ARTIFACT_REFERENCE_KEY_MISMATCH",
      "Restored GridFS filename does not match document metadata"
    );
  }

  if (
    typeof reference.sha256 !==
      "string" ||
    reference.sha256 !==
      actualSha256
  ) {
    throw failure(
      "RESTORE_ARTIFACT_REFERENCE_SHA_MISMATCH",
      "Restored document metadata SHA-256 does not match GridFS bytes"
    );
  }

  const gridFsSha =
    file?.metadata?.sha256;
  if (
    typeof gridFsSha !==
      "string" ||
    gridFsSha !==
      reference.sha256
  ) {
    throw failure(
      "RESTORE_ARTIFACT_GRIDFS_SHA_MISMATCH",
      "Restored GridFS metadata SHA-256 does not match document metadata"
    );
  }

  const gridFsDocumentId =
    file?.metadata?.documentId;
  if (
    typeof gridFsDocumentId !==
      "string" ||
    gridFsDocumentId !==
      reference.documentId
  ) {
    throw failure(
      "RESTORE_ARTIFACT_DOCUMENT_ID_MISMATCH",
      "Restored GridFS document ID does not match document-version metadata"
    );
  }

  for (
    const [value, code] of [
      [
        reference.size,
        "RESTORE_ARTIFACT_REFERENCE_SIZE_MISMATCH"
      ],
      [
        file?.metadata?.size,
        "RESTORE_ARTIFACT_GRIDFS_SIZE_MISMATCH"
      ]
    ]
  ) {
    if (
      Number.isFinite(value) &&
      Number(value) !==
        actualBytes
    ) {
      throw failure(
        code,
        "Restored artifact size metadata does not match GridFS bytes"
      );
    }
  }

  return {
    storageKey,
    documentId:
      reference.documentId,
    sha256:
      actualSha256,
    bytes:
      actualBytes
  };
}
