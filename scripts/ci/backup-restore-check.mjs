import { readFile } from "node:fs/promises";

const [backup, restore, acceptance] =
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

  if (
    /--uri=|--password=/.test(
      source
    )
  ) {
    throw new Error(
      `${name} must not expose MongoDB credentials in process arguments`
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
  /--nsInclude=.*deca_\*/,
  "Backup must be restricted to DeCA namespaces"
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
  /deca_pdf\.files/,
  "Restore must verify GridFS files"
);
requirePattern(
  restore,
  /deca_pdf\.chunks/,
  "Restore must verify GridFS chunks"
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
  /allArtifactsVerified/,
  "DR acceptance evidence must report full GridFS verification"
);

if (
  /SKIP_|BYPASS_|ALLOW_PRODUCTION_RESTORE|FORCE_RESTORE/i.test(
    backup + restore + acceptance
  )
) {
  throw new Error(
    "Backup/restore automation must not expose safety bypasses"
  );
}

console.log(
  "Backup/restore automation contract OK (0600 config, scoped archive, SHA-256, isolated namespace remap, all-GridFS integrity, default DR cleanup, one-command acceptance, no production-restore bypass)"
);
