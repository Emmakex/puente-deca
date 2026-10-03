# Retention, purge and artifact reconciliation

Puente DeCA treats the generated electronic document as regulated evidence.

## Legal floor

The implementation uses a **minimum one-year retention floor** for generated DeCA PDFs.

Normative traceability:

- Orden FOM/2861/2012, article 9: the obliged parties must retain a copy of the control document for at least one year.
- Resolución de 5 de junio de 2026 (BOE-A-2026-12784), section Segundo.4: contractual shippers and effective carriers must retain generated electronic files for at least one year; where one party generated them, it is sufficient that the other can download them during that year.

The current artifact metadata records `retentionNotBefore` conservatively from the transport date plus one year.

## Design rule

Retention expiry allows the **PDF binary** to become eligible for purge. It does not make the immutable document-version metadata or audit history disposable.

After purge:

```text
deca_document_versions
  -> remains immutable

deca_artifact_purges
  -> records documentId
  -> storageKey
  -> retention floor
  -> purge time
  -> whether the binary existed
  -> reason

deca_audit_events
  -> artifact.retention.purged
```

The public QR URL naturally returns not found after the PDF binary has been purged.

## Safe operation

Inspection:

```bash
npm run retention:inspect
```

This is non-destructive.

Purge command:

```bash
npm run retention:purge
```

This is also non-destructive unless the operator supplies:

```bash
RETENTION_PURGE_CONFIRM=PURGE_ELIGIBLE_DECA_PDFS \
npm run retention:purge
```

Optional controls:

```bash
RETENTION_LIMIT=100
RETENTION_AS_OF=2027-10-03T00:00:00.000Z
```

The confirmation phrase is deliberately awkward to prevent accidental destructive execution.

## Reconciliation

Run:

```bash
npm run artifacts:reconcile
```

The report is diagnostic only. It never deletes data.

It identifies:

- **missingBeforeRetention** — metadata references a PDF that is already missing while the legal retention floor is still active. Treat this as an integrity incident.
- **missingAfterRetention** — the PDF is absent after the retention floor but there is no purge evidence yet.
- **orphanedArtifacts** — GridFS/filesystem contains a PDF that has no immutable document-version reference.
- **purgedArtifactsStillPresent** — purge evidence exists but the PDF binary is still physically present.

## Operational policy

1. Run reconciliation before every destructive retention batch.
2. If `missingBeforeRetention > 0`, stop purge processing and investigate/restore first.
3. Keep purge batches bounded with `RETENTION_LIMIT`.
4. Run reconciliation again after purge.
5. Preserve `deca_document_versions`, `deca_artifact_purges` and `deca_audit_events` in backups.
6. Do not automatically delete orphaned artifacts. Investigate their origin first.
7. Never make retention purge depend on a browser/UI request.

## Production acceptance still required

Before enabling scheduled purge:

- validate one-year calculations against real production transport dates/timezones;
- perform live Atlas/GridFS reconciliation;
- restore a deliberately removed active PDF from backup;
- verify that a post-retention purge leaves version/audit evidence intact;
- establish an approved purge cadence and operator/audit process.
