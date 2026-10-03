import { readFile } from "node:fs/promises";

const [backup, restore] =
  await Promise.all([
    readFile(
      "scripts/production/backup-deca.mjs",
      "utf8"
    ),
    readFile(
      "scripts/production/restore-drill.mjs",
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
  /RESTORE_ARTIFACT_INTEGRITY_MISMATCH/,
  "Restore drill must verify a restored PDF SHA-256"
);

if (
  /SKIP_|BYPASS_|ALLOW_PRODUCTION_RESTORE|FORCE_RESTORE/i.test(
    backup + restore
  )
) {
  throw new Error(
    "Backup/restore automation must not expose safety bypasses"
  );
}

console.log(
  "Backup/restore automation contract OK (0600 config, scoped archive, SHA-256, isolated namespace remap, GridFS integrity, no production-restore bypass)"
);
