# MongoDB Atlas + GridFS backup and restore runbook

Puente DeCA production data lives in the same MongoDB Atlas stack as Kairoseth Platform, isolated under DeCA namespaces.

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

A restore is incomplete if document metadata is restored without the GridFS bucket, or vice versa.

## Preferred recovery path

Where the Atlas cluster tier and project configuration provide managed backups / point-in-time recovery, use Atlas-managed recovery as the primary disaster-recovery mechanism.

Use logical `mongodump` / `mongorestore` as a portable secondary backup and as the repeatable restore-drill path.

MongoDB recommends using the latest stable MongoDB Database Tools for dump/restore operations and validating version/feature compatibility between source and restore target.

## Logical backup drill

Use a dedicated backup credential and never write the connection string into source control.

Example:

```bash
export MONGODB_URI='mongodb+srv://...'
export MONGODB_DB_NAME='kairoseth'

mongodump \
  --uri="$MONGODB_URI" \
  --archive="puente-deca-$(date +%Y%m%d-%H%M%S).archive" \
  --gzip \
  --nsInclude="$MONGODB_DB_NAME.deca_*"
```

The namespace pattern includes both DeCA metadata collections and the `deca_pdf.files/chunks` GridFS collections.

For a consistency-focused logical drill, place Puente DeCA in a write-maintenance window for the duration of the dump. Do not treat an online logical dump as a substitute for Atlas point-in-time recovery.

## Restore drill

Always restore into an isolated staging/DR target first.

```bash
export RESTORE_URI='mongodb+srv://...'

mongorestore \
  --uri="$RESTORE_URI" \
  --archive="puente-deca-YYYYMMDD-HHMMSS.archive" \
  --gzip \
  --nsInclude="kairoseth.deca_*"
```

After restore, the automated `production:restore-drill` now performs the metadata/GridFS reconciliation and verifies every stored PDF byte-for-byte against both GridFS metadata and `deca_document_versions.artifact` evidence.

For an inspection/preserved DR run, additionally:

1. connect the Puente DeCA service to the restored database;
2. confirm reconciliation remains at zero anomalies;
3. verify at least one public QR path end-to-end;
4. verify connector credentials are still hashed and revocation state is preserved;
5. verify audit and purge records;
6. only then approve the restore procedure.

## Recovery test cases

The recurring recovery drill must include:

- most recent shipment + PDF;
- multi-version shipment lineage;
- a revoked connector credential;
- an artifact still inside legal retention;
- a document already purged after retention;
- GridFS PDF integrity verification;
- reconciliation returning zero premature losses.

## Production safeguards

- use a dedicated Atlas backup/service identity with least privilege;
- keep backup encryption and retention under the organization's backup policy;
- protect archive files as sensitive operational data;
- do not restore production dumps to developer laptops;
- record restore drill date, operator, source backup, target and result;
- perform the drill after any material schema/GridFS change.
