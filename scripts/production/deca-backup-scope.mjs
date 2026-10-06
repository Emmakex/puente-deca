export const DECA_BACKUP_COLLECTIONS = Object.freeze([
  "deca_organizations",
  "deca_api_credentials",
  "deca_shipments",
  "deca_document_versions",
  "deca_idempotency",
  "deca_audit_events",
  "deca_artifact_purges",
  "deca_pdf.files",
  "deca_pdf.chunks"
]);

export const decaBackupNamespaces = (
  databaseName = "kairoseth"
) =>
  DECA_BACKUP_COLLECTIONS.map(
    (collectionName) =>
      `${databaseName}.${collectionName}`
  );
