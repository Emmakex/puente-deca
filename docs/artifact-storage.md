# PDF artifact storage

Puente DeCA stores document metadata and PDF bytes separately while keeping both on the Kairoseth MongoDB Atlas stack.

## Production

Metadata:

```text
MongoDB Atlas
  └─ deca_document_versions
       └─ artifact.storageKey / size / sha256 / contentType / retentionNotBefore
```

PDF bytes:

```text
MongoDB Atlas GridFS
  └─ bucket: deca_pdf
       ├─ deca_pdf.files
       └─ deca_pdf.chunks
```

This removes dependence on the local filesystem of the Puente DeCA process.

## Driver selection

Development/tests:

```text
ARTIFACT_DRIVER=file
ARTIFACT_DIR=.data/documents
```

Production:

```text
ARTIFACT_DRIVER=gridfs
MONGODB_URI=<same Atlas cluster used by Kairoseth>
MONGODB_DB_NAME=kairoseth
DECA_GRIDFS_BUCKET=deca_pdf
```

When `MONGODB_URI` is present, GridFS is selected automatically unless `ARTIFACT_DRIVER` is explicitly configured.

Production refuses filesystem artifact storage unless the emergency-only override `ALLOW_FILE_ARTIFACTS_IN_PRODUCTION=1` is supplied.

## Integrity

Every stored PDF keeps:

- deterministic storage key: `<documentId>.pdf`;
- byte size;
- SHA-256 checksum;
- `application/pdf` content type.

The public QR endpoint still reads the PDF through the artifact-store contract and compares the stored bytes against the checksum recorded in the immutable document-version metadata before returning it.

## Limits

The GridFS adapter enforces the same conservative DeCA limit used by the PDF engine:

```text
5,000,000 bytes maximum
```

The limit is checked on both write and read.

## Atomic document flow

Document generation remains:

```text
render PDF
  -> save PDF artifact
  -> append immutable document version
       -> success: retain artifact
       -> failure: remove just-created artifact
```

This means a failed metadata/version write does not intentionally leave an orphaned PDF.

## GridFS indexes

The bucket keeps the standard GridFS structures plus a unique filename index. The unique filename preserves the existing invariant that a document ID can have only one PDF artifact.

## Deployment note

The Puente DeCA service may use a dedicated Atlas database user restricted to the DeCA collections and GridFS bucket. It does not need access to Kairoseth user/session collections.

## Still required before production acceptance

- live GridFS upload/read/delete smoke test against Atlas;
- verify the service Atlas user can create/read GridFS indexes;
- backup/restore drill including GridFS collections;
- retention-aware deletion policy;
- orphan reconciliation check between immutable document metadata and GridFS.
