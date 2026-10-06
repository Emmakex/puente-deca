# Automated logical backup and restore drill

Puente DeCA provides guarded wrappers around MongoDB Database Tools for the portable logical backup/restore drill plus a one-command live acceptance flow.

Atlas-managed backup/PITR remains the preferred primary disaster-recovery mechanism when enabled. These commands provide a repeatable secondary portability/recovery test.

The DeCA completion gate uses an explicit core namespace allowlist shared by backup and restore. Frozen eCMR/eFTI namespaces are deliberately excluded even if they coexist in the same `kairoseth` database.

## Canonical DeCA DR scope

The shared allowlist lives in:

```text
scripts/production/deca-backup-scope.mjs
```

It contains:

```text
deca_organizations
deca_api_credentials
deca_shipments
deca_document_versions
deca_idempotency
deca_audit_events
deca_artifact_purges
deca_pdf.files
deca_pdf.chunks
```

A wildcard such as `kairoseth.deca_*` is intentionally not accepted as the DeCA completion boundary.

## Prerequisite

Install a current compatible MongoDB Database Tools release containing:

- `mongodump`;
- `mongorestore`.

The wrappers use the Database Tools `--config` YAML option for the connection URI. The temporary config file is created with mode `0600` and deleted after use, avoiding credentials in process arguments.

## Create backup

Environment:

```text
MONGODB_URI=<source Atlas URI>
MONGODB_DB_NAME=kairoseth
BACKUP_OUTPUT_DIR=<optional output directory>
```

Run:

```bash
npm run production:backup
```

The command dumps only the canonical DeCA DR allowlist and emits:

```text
<archive>.archive.gz
<archive>.archive.gz.sha256
<archive>.archive.gz.metadata.json
```

The metadata schema records the exact namespace list, size, SHA-256, creation time and Database Tools version without recording the MongoDB URI.

## Restore drill

Restore **only** into a dedicated DR/staging database.

Required environment:

```text
RESTORE_MONGODB_URI=<DR/staging Atlas URI>
RESTORE_DB_NAME=kairoseth_deca_dr_<identifier>
BACKUP_ARCHIVE=<absolute or relative archive path>
BACKUP_EXPECTED_SHA256=sha256:<64 hex>
```

Run:

```bash
npm run production:restore-drill
```

The command refuses:

```text
RESTORE_DB_NAME=kairoseth
```

and accepts only the `kairoseth_deca_dr_*` naming convention.

It verifies the archive checksum before import, restores only the canonical allowlist and remaps:

```text
kairoseth.<allowed DeCA collection>
->
kairoseth_deca_dr_<identifier>.<same collection>
```

The isolated target uses `--drop --stopOnError` so a repeated drill starts from a clean DR copy and stops on restore errors.

## Post-restore verification

A successful drill verifies:

- all required DeCA core metadata collections exist;
- `deca_pdf.files` and `deca_pdf.chunks` exist;
- at least one controlled DeCA PDF is present;
- restored document references and GridFS reconcile with zero premature loss, post-retention loss, orphaned artifacts or purged artifacts still present;
- every restored GridFS artifact can be downloaded;
- every artifact starts with the PDF signature;
- every artifact remains under the 5 MB DeCA ceiling;
- every artifact matches its GridFS `metadata.sha256`;
- every stored artifact also matches the corresponding `deca_document_versions.artifact` storage key, document ID, SHA-256 and recorded size;
- collection/document counts, reconciliation counts, verified metadata/GridFS links, verified artifact count and verified bytes are reported for evidence.

After success the isolated DR database is deleted automatically so the drill is repeatable and stale recovery databases do not accumulate.

If post-restore validation fails, cleanup is still attempted from the `finally` path. A cleanup failure emits a sanitized `RESTORE_CLEANUP_FAILED` warning so operators know an isolated `kairoseth_deca_dr_*` database may require manual removal; production database names remain forbidden.

For a deliberate inspection run only, set:

```text
RESTORE_DR_PRESERVE=1
```

This can preserve only a target already constrained by the `kairoseth_deca_dr_*` naming rule; it does not weaken the production-database refusal.

## One-command DR acceptance

For the normal live gate, provide:

```text
MONGODB_URI=<source Atlas URI>
MONGODB_DB_NAME=kairoseth
RESTORE_MONGODB_URI=<DR/staging Atlas URI>
BACKUP_OUTPUT_DIR=<optional output directory>
```

Then run:

```bash
npm run production:backup-restore-drill
```

The command creates the scoped backup, reuses its exact archive path and SHA-256 internally, generates a unique isolated DR database unless `RESTORE_DB_NAME` is supplied, restores it, verifies all GridFS PDFs and collection counts, cleans up the isolated DR database by default, and emits one machine-readable JSON acceptance result.

The machine-readable acceptance result retains only the backup byte count, SHA-256, explicit namespace list and restore verification result. It does not expose the source/restore MongoDB URIs or the temporary backup path.

The backup archive plus checksum and metadata remain in `BACKUP_OUTPUT_DIR` for a direct operator-run drill. In the protected GitHub acceptance workflow, the archive is deleted from the runner after the evidence result is produced and only sanitized evidence is retained.

## Safety model

There is no production-restore override flag.

The restore wrapper will not target the database name `kairoseth`.

The DeCA DR gate cannot require or use eCMR/eFTI namespaces as acceptance evidence.

Use Atlas-managed recovery procedures for an actual production disaster; the drill exists to prove that portable logical DeCA core backups can be restored and validated independently.
