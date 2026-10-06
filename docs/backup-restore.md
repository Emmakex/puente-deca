# MongoDB Atlas + GridFS backup and restore runbook

Puente DeCA production data lives in the same MongoDB Atlas stack as Kairoseth Platform, isolated under explicit DeCA core namespaces.

This runbook deliberately excludes frozen eCMR/eFTI collections from the DeCA completion gate. A collection sharing the `deca_` prefix is not automatically part of this backup scope.

## Data that must travel together

Metadata collections:

```text
deca_organizations
deca_api_credentials
deca_shipments
deca_document_versions
deca_idempotency
deca_audit_events
deca_artifact_purges
```

GridFS bucket:

```text
deca_pdf.files
deca_pdf.chunks
```

The canonical allowlist is defined in:

```text
scripts/production/deca-backup-scope.mjs
```

Backup and restore both consume that same allowlist so the two sides cannot silently drift apart.

A restore is incomplete if document metadata is restored without the GridFS bucket, or vice versa.

## Preferred recovery path

Where the Atlas cluster tier and project configuration provide managed backups / point-in-time recovery, use Atlas-managed recovery as the primary disaster-recovery mechanism.

Use logical `mongodump` / `mongorestore` as a portable secondary backup and as the repeatable restore-drill path.

## Logical backup drill

Use the guarded production wrapper:

```bash
MONGODB_URI='<source Atlas URI>' \
MONGODB_DB_NAME='kairoseth' \
npm run production:backup
```

The wrapper:

- writes the MongoDB URI only to a temporary `0600` Database Tools config file;
- never passes credentials through `--uri` or `--password` process arguments;
- dumps only the explicit DeCA core namespace allowlist;
- creates one compressed archive;
- computes SHA-256;
- writes sanitized metadata containing the exact included namespace list;
- removes the temporary credential config.

Do not replace the allowlist with `kairoseth.deca_*`: frozen or future adjacent namespaces must not become part of DeCA acceptance implicitly.

For a consistency-focused logical drill, place Puente DeCA in a write-maintenance window for the duration of the dump when operationally appropriate. Do not treat an online logical dump as a substitute for Atlas point-in-time recovery.

## Restore drill

Always restore into an isolated staging/DR target. The target database must match:

```text
kairoseth_deca_dr_*
```

The production database name `kairoseth` is explicitly rejected.

Use:

```bash
RESTORE_MONGODB_URI='<DR/staging Atlas URI>' \
RESTORE_DB_NAME='kairoseth_deca_dr_test' \
BACKUP_ARCHIVE='<archive path>' \
BACKUP_EXPECTED_SHA256='sha256:<64 hex>' \
npm run production:restore-drill
```

The restore wrapper verifies the archive checksum before import, restores only the shared DeCA allowlist, remaps it into the isolated target, performs metadata/GridFS reconciliation and verifies every restored PDF byte-for-byte against GridFS metadata and `deca_document_versions.artifact` evidence.

By default the isolated database is deleted after the drill. `RESTORE_DR_PRESERVE=1` is allowed only for an already-isolated `kairoseth_deca_dr_*` target when deliberate inspection is required.

## One-command live acceptance

The protected live path is:

```bash
npm run production:backup-restore-drill
```

It performs source backup → exact SHA-bound restore → full integrity/reconciliation checks → isolated DR cleanup and emits one machine-readable result.

The GitHub workflow `DeCA Backup Restore Acceptance` retains only sanitized acceptance evidence. Backup archives remain sensitive operational material and are deleted from the hosted runner after the workflow.

## Recovery test cases

The recurring recovery drill must cover:

- most recent shipment + PDF;
- multi-version DeCA document lineage;
- a revoked connector credential;
- an artifact still inside legal retention;
- a document already purged after retention;
- GridFS PDF integrity verification;
- metadata↔GridFS link verification;
- reconciliation returning zero anomalies;
- isolated target cleanup.

## Production safeguards

- use a dedicated Atlas backup/service identity with least privilege;
- keep backup encryption and retention under the organization's backup policy;
- protect archive files as sensitive operational data;
- do not restore production dumps to developer laptops;
- never use a wildcard namespace as the DeCA completion boundary;
- never use eCMR/eFTI data to satisfy the DeCA DR gate;
- record restore drill date, source evidence SHA, target class and result;
- perform the drill after any material DeCA schema/GridFS change.
