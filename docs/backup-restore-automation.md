# Automated logical backup and restore drill

Puente DeCA provides guarded wrappers around MongoDB Database Tools for the portable logical backup/restore drill.

Atlas-managed backup/PITR remains the preferred primary disaster-recovery mechanism when enabled. These commands provide a repeatable secondary portability/recovery test.

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

The command dumps only:

```text
kairoseth.deca_*
```

which includes Puente DeCA metadata and the `deca_pdf.files/chunks` GridFS bucket.

Outputs:

```text
<archive>.archive.gz
<archive>.archive.gz.sha256
<archive>.archive.gz.metadata.json
```

The metadata records the namespace, size, SHA-256, creation time and Database Tools version without recording the MongoDB URI.

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

It verifies the archive checksum before import, then runs a namespace remap:

```text
kairoseth.* -> kairoseth_deca_dr_<identifier>.*
```

for the included `kairoseth.deca_*` namespaces.

The isolated target uses `--drop --stopOnError` so a repeated drill starts from a clean DR copy and stops on restore errors.

## Post-restore verification

A successful drill verifies:

- all required DeCA metadata collections exist;
- `deca_pdf.files` exists and contains at least one controlled PDF;
- `deca_pdf.chunks` exists;
- one restored GridFS PDF can be downloaded;
- the restored bytes remain under 5 MB;
- the restored bytes match `metadata.sha256`;
- collection/document counts are reported for evidence.

The DR database is intentionally left in place after success for inspection. Cleanup remains an explicit operator action after the evidence has been reviewed.

## Safety model

There is no production-restore override flag.

The restore wrapper will not target the database name `kairoseth`.

Use Atlas-managed recovery procedures for an actual production disaster; the drill exists to prove that portable logical backups can be restored and validated independently.
