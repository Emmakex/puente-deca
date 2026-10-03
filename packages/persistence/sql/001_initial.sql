BEGIN;

CREATE TABLE IF NOT EXISTS pdeca_schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdeca_organizations (
  organization_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  external_reference TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pdeca_api_credentials (
  credential_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES pdeca_organizations(organization_id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  scopes JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS pdeca_api_credentials_org_idx
  ON pdeca_api_credentials (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pdeca_shipments (
  shipment_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES pdeca_organizations(organization_id) ON DELETE RESTRICT,
  external_reference TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS pdeca_shipments_org_updated_idx
  ON pdeca_shipments (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS pdeca_shipments_org_external_idx
  ON pdeca_shipments (organization_id, external_reference);

CREATE TABLE IF NOT EXISTS pdeca_document_versions (
  document_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES pdeca_organizations(organization_id) ON DELETE RESTRICT,
  shipment_id TEXT NOT NULL REFERENCES pdeca_shipments(shipment_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  previous_version_id TEXT NULL REFERENCES pdeca_document_versions(document_id) ON DELETE RESTRICT,
  access_path TEXT NOT NULL UNIQUE,
  snapshot JSONB NOT NULL,
  artifact JSONB NOT NULL,
  stored_at TIMESTAMPTZ NOT NULL,
  UNIQUE (shipment_id, version)
);

CREATE INDEX IF NOT EXISTS pdeca_document_versions_org_shipment_idx
  ON pdeca_document_versions (organization_id, shipment_id, version);

CREATE TABLE IF NOT EXISTS pdeca_idempotency (
  scope TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES pdeca_organizations(organization_id) ON DELETE RESTRICT,
  shipment_id TEXT NOT NULL REFERENCES pdeca_shipments(shipment_id) ON DELETE RESTRICT,
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS pdeca_idempotency_org_idx
  ON pdeca_idempotency (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pdeca_audit_events (
  event_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES pdeca_organizations(organization_id) ON DELETE RESTRICT,
  shipment_id TEXT NULL REFERENCES pdeca_shipments(shipment_id) ON DELETE RESTRICT,
  document_id TEXT NULL REFERENCES pdeca_document_versions(document_id) ON DELETE RESTRICT,
  subject_id TEXT NULL,
  type TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS pdeca_audit_events_org_at_idx
  ON pdeca_audit_events (organization_id, at, event_id);

CREATE INDEX IF NOT EXISTS pdeca_audit_events_shipment_at_idx
  ON pdeca_audit_events (organization_id, shipment_id, at, event_id)
  WHERE shipment_id IS NOT NULL;

INSERT INTO pdeca_schema_migrations (version)
VALUES (1)
ON CONFLICT (version) DO NOTHING;

COMMIT;
