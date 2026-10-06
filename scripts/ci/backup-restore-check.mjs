import { readFile } from "node:fs/promises";

const [
  backup,
  restore,
  acceptance,
  scope
] =
  await Promise.all([
    readFile(
      "scripts/production/backup-deca.mjs",
      "utf8"
    ),
    readFile(
      "scripts/production/restore-drill.mjs",
      "utf8"
    ),
    readFile(
      "scripts/production/backup-restore-acceptance.mjs",
      "utf8"
    ),
    readFile(
      "scripts/production/deca-backup-scope.mjs",
      "utf8"
    )
  ]);

const requirePattern = (
  source,
  pattern,
  message
) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

for (
  const requiredCollection of [
    "deca_organizations",
    "deca_api_credentials",
    "deca_shipments",
    "deca_document_versions",
    "deca_idempotency",
    "deca_audit_events",
    "deca_artifact_purges",
    "deca_pdf.files",
    "deca_pdf.chunks"
  ]
) {
  if (!scope.includes(`"${requiredCollection}"`)) {
    throw new Error(
      `DeCA DR scope is missing ${requiredCollection}`
    );
  }
}

if (
  /ecmr|efti|regulatory/i.test(
    scope
  )
) {
  throw new Error(
    "DeCA DR scope must not include frozen eCMR/eFTI or regulatory namespaces"
  );
}

for (
  const [name, source] of [
    ["backup", backup],
    ["restore", restore]
  ]
) {
  requirePattern(
    source,
    /mode:\s*0o600|chmod\([\s\S]*0o600/,
    `${name} must protect MongoDB Database Tools config with mode 0600`
  );

  requirePattern(
    source,
    /--config=/,
    `${name} must pass sensitive MongoDB URI through --config`
  );

  requirePattern(
    source,
    /decaBackupNamespaces/,
    `${name} must use the shared DeCA-only namespace allowlist`
  );

  if (
    /--uri=|--password=/.test(
      source
    )
  ) {
    throw new Error(
      `${name} must not expose MongoDB credentials in process arguments`
    );
  }

  if (
    /--nsInclude=.*deca_\*/.test(
      source
    )
  ) {
    throw new Error(
      `${name} must not use a wildcard DeCA namespace scope`
    );
  }
}

requirePattern(
  backup,
  /--archive=/,
  "Backup must use a single archive"
);
requirePattern(
  backup,
  /"--gzip"/,
  "Backup archive must be compressed"
);
requirePattern(
  backup,
  /sha256File/,
  "Backup must compute archive SHA-256"
);
requirePattern(
  backup,
  /\.metadata\.json/,
  "Backup must emit metadata evidence"
);
requirePattern(
  backup,
  /schemaVersion:\s*2/,
  "Backup metadata must use the explicit namespace evidence schema"
);
requirePattern(
  backup,
  /namespaces/,
  "Backup evidence must record the explicit namespace allowlist"
);

requirePattern(
  restore,
  /restoreDatabase ===[\s\S]*"kairoseth"/,
  "Restore must explicitly reject the production database"
);
requirePattern(
  restore,
  /\^kairoseth_deca_dr_/,
  "Restore target must use the isolated DR naming convention"
);
requirePattern(
  restore,
  /RESTORE_CHECKSUM_MISMATCH/,
  "Restore must verify archive SHA-256 before importing"
);
requirePattern(
  restore,
  /"--stopOnError"/,
  "Restore must stop immediately on import errors"
);
requirePattern(
  restore,
  /"--drop"/,
  "Restore drill must replace only the isolated DR target namespaces"
);
requirePattern(
  restore,
  /--nsFrom=kairoseth\.\*/,
  "Restore must remap source namespaces"
);
requirePattern(
  restore,
  /--nsTo=\$\{restoreDatabase\}\.\*/,
  "Restore must remap into the isolated DR database"
);
requirePattern(
  restore,
  /DECA_BACKUP_COLLECTIONS/,
  "Restore verification must use the shared DeCA-only collection allowlist"
);
requirePattern(
  restore,
  /deca_pdf\.files/,
  "Restore must verify GridFS files"
);
requirePattern(
  restore,
  /for await \([\s\S]*artifactCursor/,
  "Restore must verify every restored GridFS file"
);
requirePattern(
  restore,
  /RESTORE_ARTIFACT_NOT_PDF/,
  "Restore drill must reject non-PDF GridFS artifacts"
);
requirePattern(
  restore,
  /RESTORE_ARTIFACT_INTEGRITY_MISMATCH/,
  "Restore drill must verify restored PDF SHA-256"
);
requirePattern(
  restore,
  /allArtifactsVerified:\s*true/,
  "Restore drill must report full artifact verification"
);
requirePattern(
  restore,
  /reconcileArtifacts/,
  "Restore drill must reconcile restored document metadata and GridFS"
);
requirePattern(
  restore,
  /assertRestoreReconciliation/,
  "Restore drill must fail closed on reconciliation anomalies"
);
requirePattern(
  restore,
  /assertRestoredArtifactLink/,
  "Restore drill must cross-check document metadata against GridFS evidence"
);
requirePattern(
  restore,
  /metadataArtifactLinksVerified/,
  "Restore drill must report metadata-to-GridFS links verified"
);
requirePattern(
  restore,
  /finally[\s\S]*dropDatabase\(\)/,
  "Restore drill must attempt isolated DR cleanup after validation failures"
);
requirePattern(
  restore,
  /puente-deca-restore-drill-cleanup/,
  "Restore drill must emit sanitized cleanup-failure evidence"
);
requirePattern(
  restore,
  /RESTORE_DR_PRESERVE/,
  "Restore drill must expose explicit isolated-database preservation for inspection"
);
requirePattern(
  restore,
  /dropDatabase\(\)/,
  "Restore drill must clean up the isolated DR database by default"
);

requirePattern(
  acceptance,
  /backup-deca\.mjs/,
  "DR acceptance must execute the backup wrapper"
);
requirePattern(
  acceptance,
  /restore-drill\.mjs/,
  "DR acceptance must execute the restore wrapper"
);
requirePattern(
  acceptance,
  /BACKUP_ARCHIVE:/,
  "DR acceptance must pass the produced archive directly to restore"
);
requirePattern(
  acceptance,
  /BACKUP_EXPECTED_SHA256:/,
  "DR acceptance must pass the produced SHA-256 directly to restore"
);
requirePattern(
  acceptance,
  /kairoseth_deca_dr_/,
  "DR acceptance must generate an isolated DR database name"
);
requirePattern(
  acceptance,
  /namespaces:/,
  "DR acceptance evidence must expose the exact DeCA namespace allowlist"
);
requirePattern(
  acceptance,
  /allArtifactsVerified/,
  "DR acceptance evidence must report full GridFS verification"
);
requirePattern(
  acceptance,
  /metadataArtifactLinksVerified/,
  "DR acceptance evidence must report metadata-to-GridFS link verification"
);
requirePattern(
  acceptance,
  /reconciliation:/,
  "DR acceptance evidence must include restored reconciliation counts"
);

if (
  /SKIP_|BYPASS_|ALLOW_PRODUCTION_RESTORE|FORCE_RESTORE/i.test(
    backup + restore + acceptance + scope
  )
) {
  throw new Error(
    "Backup/restore automation must not expose safety bypasses"
  );
}

console.log(
  "Backup/restore automation contract OK (DeCA-only namespace allowlist, 0600 config, SHA-256, isolated namespace remap, metadata/GridFS reconciliation, all-artifact integrity, failure cleanup, no frozen eCMR/eFTI dependency, no production-restore bypass)"
);
