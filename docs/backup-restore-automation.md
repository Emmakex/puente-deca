# Automated logical backup and restore drill

Puente DeCA provides guarded wrappers around MongoDB Database Tools for the portable logical backup/restore drill plus a one-command live acceptance flow.

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
- every restored GridFS artifact can be downloaded;
- every artifact starts with the PDF signature;
- every artifact remains under the 5 MB DeCA ceiling;
- every artifact matches its `metadata.sha256`;
- collection/document counts, verified artifact count and verified bytes are reported for evidence.

After success the isolated DR database is deleted automatically so the drill is repeatable and stale recovery databases do not accumulate.

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

The command creates the scoped backup, reuses its exact archive path and SHA-256, generates a unique isolated DR database unless `RESTORE_DB_NAME` is supplied, restores it, verifies all GridFS PDFs and collection counts, cleans up the isolated DR database by default, and emits one machine-readable JSON acceptance result.

The backup archive plus checksum and metadata remain in `BACKUP_OUTPUT_DIR` as evidence.

## Safety model

There is no production-restore override flag.

The restore wrapper will not target the database name `kairoseth`.

Use Atlas-managed recovery procedures for an actual production disaster; the drill exists to prove that portable logical backups can be restored and validated independently.
