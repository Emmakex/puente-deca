const toDate = (value, name) => {
  const date = value instanceof Date
    ? value
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${name} must be a valid date`);
  }

  return date;
};

export async function inspectRetention({
  store,
  artifactStore,
  asOf = new Date(),
  limit = 100
}) {
  if (!store || !artifactStore) {
    throw new TypeError(
      "store and artifactStore are required"
    );
  }

  const eligible =
    await store.listRetentionEligibleArtifacts({
      asOf: toDate(asOf, "asOf").toISOString(),
      limit
    });

  return {
    asOf: toDate(asOf, "asOf").toISOString(),
    eligible,
    count: eligible.length
  };
}

export async function purgeEligibleArtifacts({
  store,
  artifactStore,
  asOf = new Date(),
  limit = 100,
  confirm = false
}) {
  const inspection = await inspectRetention({
    store,
    artifactStore,
    asOf,
    limit
  });

  if (!confirm) {
    return {
      ...inspection,
      dryRun: true,
      purged: []
    };
  }

  const purged = [];

  for (const candidate of inspection.eligible) {
    const removed = await artifactStore.remove(
      candidate.storageKey
    );

    const record =
      await store.recordArtifactPurge({
        organizationId:
          candidate.organizationId,
        shipmentId: candidate.shipmentId,
        documentId: candidate.documentId,
        storageKey: candidate.storageKey,
        expectedRetentionNotBefore:
          candidate.retentionNotBefore,
        artifactWasPresent: removed,
        reason: removed
          ? "retention_period_elapsed"
          : "missing_after_retention_period"
      });

    purged.push(record);
  }

  return {
    asOf: inspection.asOf,
    eligible: inspection.eligible,
    count: inspection.count,
    dryRun: false,
    purged
  };
}

export async function reconcileArtifacts({
  store,
  artifactStore,
  asOf = new Date()
}) {
  if (!store || !artifactStore) {
    throw new TypeError(
      "store and artifactStore are required"
    );
  }

  const now = toDate(asOf, "asOf");
  const [references, storageKeys, purges] =
    await Promise.all([
      store.listArtifactReferences(),
      artifactStore.listStorageKeys(),
      store.listArtifactPurgeRecords()
    ]);

  const stored = new Set(storageKeys);
  const referenced = new Map(
    references.map((entry) => [
      entry.storageKey,
      entry
    ])
  );
  const purgedKeys = new Set(
    purges.map((entry) => entry.storageKey)
  );

  const missingBeforeRetention = [];
  const missingAfterRetention = [];

  for (const reference of references) {
    if (
      stored.has(reference.storageKey) ||
      purgedKeys.has(reference.storageKey)
    ) {
      continue;
    }

    const floor = toDate(
      reference.retentionNotBefore,
      "retentionNotBefore"
    );

    if (floor > now) {
      missingBeforeRetention.push(reference);
    } else {
      missingAfterRetention.push(reference);
    }
  }

  const orphanedArtifacts = storageKeys
    .filter(
      (storageKey) =>
        !referenced.has(storageKey) &&
        !purgedKeys.has(storageKey)
    )
    .sort();

  const purgedArtifactsStillPresent = purges
    .filter(
      (record) =>
        stored.has(record.storageKey)
    );

  return {
    asOf: now.toISOString(),
    counts: {
      references: references.length,
      storedArtifacts: storageKeys.length,
      purgeRecords: purges.length,
      missingBeforeRetention:
        missingBeforeRetention.length,
      missingAfterRetention:
        missingAfterRetention.length,
      orphanedArtifacts:
        orphanedArtifacts.length,
      purgedArtifactsStillPresent:
        purgedArtifactsStillPresent.length
    },
    missingBeforeRetention,
    missingAfterRetention,
    orphanedArtifacts,
    purgedArtifactsStillPresent
  };
}
