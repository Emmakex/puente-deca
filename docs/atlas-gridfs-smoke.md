# Atlas + GridFS live smoke

The live production/staging datastore gate is automated by:

```bash
npm run production:atlas-smoke
```

Run it only with the same production-style environment validated by `npm run production:preflight`.

## What it verifies

1. production preflight passes;
2. the real MongoDB client connects;
3. the real `MongoStore` initializes all required indexes;
4. the real GridFS store initializes its bucket/indexes;
5. Atlas exposes the expected 18 metadata indexes, including the immutable eCMR amendment lineage indexes, with the exact key order/direction and `unique` constraints;
6. GridFS exposes the required unique `filename` index used by DeCA artifacts;
7. metadata `ping` succeeds;
8. GridFS probe succeeds;
9. a MongoDB transaction can write and then intentionally rollback;
10. the rollback leaves no smoke organization record;
11. a tiny PDF-like artifact can be uploaded to GridFS;
12. the artifact can be read back byte-for-byte;
13. its SHA-256 matches the value returned by the GridFS adapter;
14. the smoke artifact is removed again.

## Data hygiene

The transaction test intentionally aborts and verifies that no metadata smoke record survived.

The GridFS test uses a random `smoke_<uuid>.pdf` key and deletes it before success. Cleanup is attempted again on failure.

No real shipment, DeCA document version, connector credential or audit event is created.

## Secret handling

The command never prints:

- `MONGODB_URI`;
- `KAIROSETH_SERVICE_SECRET`;
- database credentials.

Its success output contains only the database name, GridFS bucket name and boolean acceptance results.

## Expected success

```json
{
  "status": "ok",
  "check": "atlas-gridfs-smoke",
  "database": "kairoseth",
  "artifactBucket": "deca_pdf",
  "metadataPing": true,
  "artifactPing": true,
  "indexContract": true,
  "metadataIndexesVerified": 18,
  "gridFsIndexesVerified": 1,
  "transactionRollback": true,
  "gridfsRoundTrip": true,
  "gridfsCleanup": true
}
```

Index verification is fail-closed: a missing index, a changed key/direction, or an incorrect `unique` constraint makes the smoke fail with a machine-readable error code.

A successful run is evidence for the Atlas transaction/index and GridFS upload/read/delete gates, but the roadmap item is not marked complete until this command has actually run against the intended staging/production-class Atlas environment.
