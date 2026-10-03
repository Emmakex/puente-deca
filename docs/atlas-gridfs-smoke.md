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
5. metadata `ping` succeeds;
6. GridFS probe succeeds;
7. a MongoDB transaction can write and then intentionally rollback;
8. the rollback leaves no smoke organization record;
9. a tiny PDF-like artifact can be uploaded to GridFS;
10. the artifact can be read back byte-for-byte;
11. its SHA-256 matches the value returned by the GridFS adapter;
12. the smoke artifact is removed again.

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
  "transactionRollback": true,
  "gridfsRoundTrip": true,
  "gridfsCleanup": true
}
```

A successful run is evidence for the Atlas transaction/index and GridFS upload/read/delete gates, but the roadmap item is not marked complete until this command has actually run against the intended staging/production-class Atlas environment.
