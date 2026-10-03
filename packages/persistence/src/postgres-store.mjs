import { readFile } from "node:fs/promises";
import {
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";
import { Pool } from "pg";
import { canonicalJson } from "../../core/src/canonical-json.mjs";

const clone = (value) => structuredClone(value);

const requireText = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} is required`);
  }

  return value.trim();
};

const requireRecord = (value, name) => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${name} must be an object`);
  }

  return value;
};

const conflict = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const fingerprint = (value) =>
  `sha256:${createHash("sha256")
    .update(canonicalJson(value))
    .digest("hex")}`;

const hashApiKey = (apiKey) =>
  createHash("sha256")
    .update(apiKey)
    .digest("hex");

const normalizeScopes = (scopes) => {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new TypeError("scopes must be a non-empty array");
  }

  return [
    ...new Set(
      scopes.map((scope) => requireText(scope, "scope"))
    )
  ].sort();
};

const iso = (value) => {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("PostgreSQL returned an invalid timestamp");
  }
  return date.toISOString();
};

const organizationFromRow = (row) => ({
  organizationId: row.organization_id,
  name: row.name,
  externalReference: row.external_reference,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at)
});

const credentialFromRow = (row) => ({
  credentialId: row.credential_id,
  organizationId: row.organization_id,
  name: row.name,
  keyPrefix: row.key_prefix,
  scopes: Array.isArray(row.scopes)
    ? [...row.scopes]
    : [],
  createdAt: iso(row.created_at),
  revokedAt: row.revoked_at ? iso(row.revoked_at) : null
});

const shipmentFromRow = (row) => ({
  shipmentId: row.shipment_id,
  organizationId: row.organization_id,
  externalReference: row.external_reference,
  data: clone(row.data),
  documentVersionIds: Array.isArray(row.document_version_ids)
    ? [...row.document_version_ids]
    : [],
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at)
});

const documentFromRow = (row) => ({
  organizationId: row.organization_id,
  shipmentId: row.shipment_id,
  documentId: row.document_id,
  version: Number(row.version),
  snapshot: clone(row.snapshot),
  artifact: clone(row.artifact),
  storedAt: iso(row.stored_at)
});

const auditFromRow = (row) => ({
  eventId: row.event_id,
  organizationId: row.organization_id,
  shipmentId: row.shipment_id,
  documentId: row.document_id,
  subjectId: row.subject_id,
  type: row.type,
  at: iso(row.at)
});

export class PostgresStore {
  #pool;
  #ownsPool;
  #now;
  #idFactory;
  #apiKeyFactory;

  constructor({
    pool,
    ownsPool = false,
    now = () => new Date(),
    idFactory = randomUUID,
    apiKeyFactory = () =>
      `pdeca_${randomBytes(32).toString("base64url")}`
  }) {
    if (!pool || typeof pool.query !== "function") {
      throw new TypeError("pool is required");
    }

    this.#pool = pool;
    this.#ownsPool = ownsPool;
    this.#now = now;
    this.#idFactory = idFactory;
    this.#apiKeyFactory = apiKeyFactory;
  }

  static async open({
    connectionString,
    pool = null,
    runMigrations = true,
    max = 10,
    connectionTimeoutMillis = 5000,
    idleTimeoutMillis = 30000,
    now,
    idFactory,
    apiKeyFactory
  } = {}) {
    const ownsPool = !pool;
    const resolvedPool =
      pool ??
      new Pool({
        connectionString: requireText(
          connectionString,
          "connectionString"
        ),
        max,
        connectionTimeoutMillis,
        idleTimeoutMillis
      });

    const store = new PostgresStore({
      pool: resolvedPool,
      ownsPool,
      now,
      idFactory,
      apiKeyFactory
    });

    if (runMigrations) {
      try {
        await store.migrate();
      } catch (error) {
        if (ownsPool) {
          await resolvedPool.end().catch(() => undefined);
        }
        throw error;
      }
    }

    return store;
  }

  #nowIso() {
    const value = this.#now();
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new TypeError("Clock returned an invalid date");
    }

    return date.toISOString();
  }

  async migrate() {
    const sql = await readFile(
      new URL("../sql/001_initial.sql", import.meta.url),
      "utf8"
    );
    await this.#pool.query(sql);
  }

  async close() {
    if (
      this.#ownsPool &&
      typeof this.#pool.end === "function"
    ) {
      await this.#pool.end();
    }
  }

  async #transaction(operation) {
    const client = await this.#pool.connect();

    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return clone(result);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async #appendAudit(
    client,
    {
      organizationId,
      shipmentId = null,
      documentId = null,
      subjectId = null,
      type,
      at
    }
  ) {
    const eventId = `evt_${this.#idFactory()}`;

    await client.query(
      `INSERT INTO pdeca_audit_events
        (event_id, organization_id, shipment_id, document_id, subject_id, type, at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        eventId,
        organizationId,
        shipmentId,
        documentId,
        subjectId,
        type,
        at
      ]
    );

    return {
      eventId,
      organizationId,
      shipmentId,
      documentId,
      subjectId,
      type,
      at
    };
  }

  async #selectShipment(
    queryable,
    organizationId,
    shipmentId,
    { forUpdate = false } = {}
  ) {
    if (forUpdate) {
      const locked = await queryable.query(
        `SELECT shipment_id
         FROM pdeca_shipments
         WHERE organization_id = $1
           AND shipment_id = $2
         FOR UPDATE`,
        [organizationId, shipmentId]
      );

      if (!locked.rows[0]) {
        return null;
      }
    }

    const result = await queryable.query(
      `SELECT
         s.shipment_id,
         s.organization_id,
         s.external_reference,
         s.data,
         s.created_at,
         s.updated_at,
         COALESCE(
           ARRAY_AGG(d.document_id ORDER BY d.version)
             FILTER (WHERE d.document_id IS NOT NULL),
           ARRAY[]::TEXT[]
         ) AS document_version_ids
       FROM pdeca_shipments s
       LEFT JOIN pdeca_document_versions d
         ON d.shipment_id = s.shipment_id
       WHERE
         s.organization_id = $1
         AND s.shipment_id = $2
       GROUP BY s.shipment_id`,
      [organizationId, shipmentId]
    );

    return result.rows[0]
      ? shipmentFromRow(result.rows[0])
      : null;
  }

  async ensureOrganization({
    organizationId,
    name,
    externalReference = null
  }) {
    const normalizedOrganizationId = requireText(
      organizationId,
      "organizationId"
    );
    const normalizedName = requireText(name, "name");
    const normalizedExternalReference =
      externalReference === null
        ? null
        : requireText(
            externalReference,
            "externalReference"
          );

    return this.#transaction(async (client) => {
      const at = this.#nowIso();
      const inserted = await client.query(
        `INSERT INTO pdeca_organizations
          (organization_id, name, external_reference, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (organization_id) DO NOTHING
         RETURNING *`,
        [
          normalizedOrganizationId,
          normalizedName,
          normalizedExternalReference,
          at
        ]
      );

      if (inserted.rows[0]) {
        await this.#appendAudit(client, {
          organizationId: normalizedOrganizationId,
          type: "organization.provisioned",
          at
        });
        return organizationFromRow(inserted.rows[0]);
      }

      const existing = await client.query(
        `SELECT *
         FROM pdeca_organizations
         WHERE organization_id = $1`,
        [normalizedOrganizationId]
      );

      return organizationFromRow(existing.rows[0]);
    });
  }

  async createOrganization({
    name,
    externalReference = null
  }) {
    const normalizedName = requireText(name, "name");
    const normalizedExternalReference =
      externalReference === null
        ? null
        : requireText(
            externalReference,
            "externalReference"
          );

    return this.#transaction(async (client) => {
      const at = this.#nowIso();
      const organizationId =
        `org_${this.#idFactory()}`;

      const result = await client.query(
        `INSERT INTO pdeca_organizations
          (organization_id, name, external_reference, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)
         RETURNING *`,
        [
          organizationId,
          normalizedName,
          normalizedExternalReference,
          at
        ]
      );

      await this.#appendAudit(client, {
        organizationId,
        type: "organization.created",
        at
      });

      return organizationFromRow(result.rows[0]);
    });
  }

  async getOrganization(organizationId) {
    const normalizedId = requireText(
      organizationId,
      "organizationId"
    );

    const result = await this.#pool.query(
      `SELECT *
       FROM pdeca_organizations
       WHERE organization_id = $1`,
      [normalizedId]
    );

    return result.rows[0]
      ? organizationFromRow(result.rows[0])
      : null;
  }

  async createApiCredential({
    organizationId,
    name,
    scopes = [
      "shipments:read",
      "shipments:write",
      "documents:read",
      "documents:write"
    ]
  }) {
    const normalizedOrganizationId = requireText(
      organizationId,
      "organizationId"
    );
    const normalizedName = requireText(name, "name");
    const normalizedScopes = normalizeScopes(scopes);
    const apiKey = requireText(
      this.#apiKeyFactory(),
      "generated apiKey"
    );

    return this.#transaction(async (client) => {
      const organization = await client.query(
        `SELECT 1
         FROM pdeca_organizations
         WHERE organization_id = $1`,
        [normalizedOrganizationId]
      );

      if (!organization.rows[0]) {
        throw conflict(
          "Organization does not exist",
          "ORGANIZATION_NOT_FOUND"
        );
      }

      const at = this.#nowIso();
      const credentialId =
        `cred_${this.#idFactory()}`;

      const result = await client.query(
        `INSERT INTO pdeca_api_credentials
          (credential_id, organization_id, name, key_prefix, key_hash, scopes, created_at, revoked_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NULL)
         RETURNING *`,
        [
          credentialId,
          normalizedOrganizationId,
          normalizedName,
          apiKey.slice(0, 12),
          hashApiKey(apiKey),
          JSON.stringify(normalizedScopes),
          at
        ]
      );

      await this.#appendAudit(client, {
        organizationId: normalizedOrganizationId,
        subjectId: credentialId,
        type: "api.credential.created",
        at
      });

      return {
        credential: credentialFromRow(result.rows[0]),
        apiKey
      };
    });
  }

  async listApiCredentials(organizationId) {
    const normalizedOrganizationId = requireText(
      organizationId,
      "organizationId"
    );

    const result = await this.#pool.query(
      `SELECT *
       FROM pdeca_api_credentials
       WHERE organization_id = $1
       ORDER BY created_at DESC, credential_id DESC`,
      [normalizedOrganizationId]
    );

    return result.rows.map(credentialFromRow);
  }

  async authenticateApiKey(apiKey) {
    if (
      typeof apiKey !== "string" ||
      apiKey.trim().length === 0
    ) {
      return null;
    }

    const result = await this.#pool.query(
      `SELECT *
       FROM pdeca_api_credentials
       WHERE key_hash = $1
         AND revoked_at IS NULL
       LIMIT 1`,
      [hashApiKey(apiKey.trim())]
    );

    return result.rows[0]
      ? credentialFromRow(result.rows[0])
      : null;
  }

  async revokeApiCredential({
    organizationId,
    credentialId
  }) {
    const normalizedOrganizationId = requireText(
      organizationId,
      "organizationId"
    );
    const normalizedCredentialId = requireText(
      credentialId,
      "credentialId"
    );

    return this.#transaction(async (client) => {
      const current = await client.query(
        `SELECT *
         FROM pdeca_api_credentials
         WHERE organization_id = $1
           AND credential_id = $2
         FOR UPDATE`,
        [
          normalizedOrganizationId,
          normalizedCredentialId
        ]
      );

      if (!current.rows[0]) {
        throw conflict(
          "API credential does not exist in this organization",
          "API_CREDENTIAL_NOT_FOUND"
        );
      }

      if (current.rows[0].revoked_at) {
        return credentialFromRow(current.rows[0]);
      }

      const at = this.#nowIso();
      const result = await client.query(
        `UPDATE pdeca_api_credentials
         SET revoked_at = $3
         WHERE organization_id = $1
           AND credential_id = $2
         RETURNING *`,
        [
          normalizedOrganizationId,
          normalizedCredentialId,
          at
        ]
      );

      await this.#appendAudit(client, {
        organizationId: normalizedOrganizationId,
        subjectId: normalizedCredentialId,
        type: "api.credential.revoked",
        at
      });

      return credentialFromRow(result.rows[0]);
    });
  }

  async createShipment({
    organizationId,
    externalReference,
    data,
    idempotencyKey = null
  }) {
    const normalizedOrganizationId = requireText(
      organizationId,
      "organizationId"
    );
    const normalizedExternalReference = requireText(
      externalReference,
      "externalReference"
    );
    const normalizedData = requireRecord(data, "data");
    const normalizedIdempotencyKey =
      idempotencyKey === null
        ? null
        : requireText(idempotencyKey, "idempotencyKey");
    const requestFingerprint = fingerprint({
      externalReference: normalizedExternalReference,
      data: normalizedData
    });

    return this.#transaction(async (client) => {
      const organization = await client.query(
        `SELECT 1
         FROM pdeca_organizations
         WHERE organization_id = $1`,
        [normalizedOrganizationId]
      );

      if (!organization.rows[0]) {
        throw conflict(
          "Organization does not exist",
          "ORGANIZATION_NOT_FOUND"
        );
      }

      let scope = null;

      if (normalizedIdempotencyKey) {
        scope =
          `${normalizedOrganizationId}:shipment:create:${normalizedIdempotencyKey}`;

        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext($1))",
          [scope]
        );

        const existing = await client.query(
          `SELECT shipment_id, fingerprint
           FROM pdeca_idempotency
           WHERE scope = $1`,
          [scope]
        );

        if (existing.rows[0]) {
          if (
            existing.rows[0].fingerprint !==
            requestFingerprint
          ) {
            throw conflict(
              "Idempotency key was already used with different data",
              "IDEMPOTENCY_CONFLICT"
            );
          }

          const shipment = await this.#selectShipment(
            client,
            normalizedOrganizationId,
            existing.rows[0].shipment_id
          );

          return {
            ...shipment,
            idempotentReplay: true
          };
        }
      }

      const at = this.#nowIso();
      const shipmentId =
        `shp_${this.#idFactory()}`;

      await client.query(
        `INSERT INTO pdeca_shipments
          (shipment_id, organization_id, external_reference, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $5)`,
        [
          shipmentId,
          normalizedOrganizationId,
          normalizedExternalReference,
          JSON.stringify(normalizedData),
          at
        ]
      );

      if (scope) {
        await client.query(
          `INSERT INTO pdeca_idempotency
            (scope, organization_id, shipment_id, fingerprint, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            scope,
            normalizedOrganizationId,
            shipmentId,
            requestFingerprint,
            at
          ]
        );
      }

      await this.#appendAudit(client, {
        organizationId: normalizedOrganizationId,
        shipmentId,
        type: "shipment.created",
        at
      });

      const shipment = await this.#selectShipment(
        client,
        normalizedOrganizationId,
        shipmentId
      );

      return {
        ...shipment,
        idempotentReplay: false
      };
    });
  }

  async listShipments({
    organizationId,
    limit = 50
  }) {
    const normalizedOrganizationId = requireText(
      organizationId,
      "organizationId"
    );
    const normalizedLimit = Math.min(
      100,
      Math.max(
        1,
        Number.isInteger(limit) ? limit : 50
      )
    );

    const result = await this.#pool.query(
      `SELECT
         s.shipment_id,
         s.organization_id,
         s.external_reference,
         s.data,
         s.created_at,
         s.updated_at,
         COALESCE(
           ARRAY_AGG(d.document_id ORDER BY d.version)
             FILTER (WHERE d.document_id IS NOT NULL),
           ARRAY[]::TEXT[]
         ) AS document_version_ids,
         COUNT(*) OVER() AS total_count
       FROM pdeca_shipments s
       LEFT JOIN pdeca_document_versions d
         ON d.shipment_id = s.shipment_id
       WHERE s.organization_id = $1
       GROUP BY s.shipment_id
       ORDER BY s.updated_at DESC, s.shipment_id DESC
       LIMIT $2`,
      [
        normalizedOrganizationId,
        normalizedLimit
      ]
    );

    return {
      items: result.rows.map(shipmentFromRow),
      total: result.rows[0]
        ? Number(result.rows[0].total_count)
        : 0
    };
  }

  async getShipment({
    organizationId,
    shipmentId
  }) {
    return this.#selectShipment(
      this.#pool,
      requireText(
        organizationId,
        "organizationId"
      ),
      requireText(
        shipmentId,
        "shipmentId"
      )
    );
  }

  async updateShipment({
    organizationId,
    shipmentId,
    data
  }) {
    const normalizedOrganizationId = requireText(
      organizationId,
      "organizationId"
    );
    const normalizedShipmentId = requireText(
      shipmentId,
      "shipmentId"
    );
    const normalizedData = requireRecord(data, "data");

    return this.#transaction(async (client) => {
      const current = await this.#selectShipment(
        client,
        normalizedOrganizationId,
        normalizedShipmentId,
        { forUpdate: true }
      );

      if (!current) {
        throw conflict(
          "Shipment does not exist in this organization",
          "SHIPMENT_NOT_FOUND"
        );
      }

      if (
        fingerprint(current.data) ===
        fingerprint(normalizedData)
      ) {
        return {
          ...current,
          changed: false
        };
      }

      const at = this.#nowIso();

      await client.query(
        `UPDATE pdeca_shipments
         SET data = $3::jsonb,
             updated_at = $4
         WHERE organization_id = $1
           AND shipment_id = $2`,
        [
          normalizedOrganizationId,
          normalizedShipmentId,
          JSON.stringify(normalizedData),
          at
        ]
      );

      await this.#appendAudit(client, {
        organizationId: normalizedOrganizationId,
        shipmentId: normalizedShipmentId,
        type: "shipment.updated",
        at
      });

      const updated = await this.#selectShipment(
        client,
        normalizedOrganizationId,
        normalizedShipmentId
      );

      return {
        ...updated,
        changed: true
      };
    });
  }

  async appendDocumentVersion({
    organizationId,
    shipmentId,
    snapshot,
    artifact = {}
  }) {
    const normalizedOrganizationId = requireText(
      organizationId,
      "organizationId"
    );
    const normalizedShipmentId = requireText(
      shipmentId,
      "shipmentId"
    );
    const normalizedSnapshot = requireRecord(
      snapshot,
      "snapshot"
    );
    const normalizedArtifact = requireRecord(
      artifact,
      "artifact"
    );

    if (
      normalizedSnapshot.documentType !== "DECA" ||
      typeof normalizedSnapshot.documentId !== "string" ||
      !Number.isInteger(normalizedSnapshot.version)
    ) {
      throw new TypeError(
        "snapshot must be a valid DeCA document snapshot"
      );
    }

    let accessPath;
    try {
      accessPath =
        new URL(normalizedSnapshot.accessUrl).pathname;
    } catch {
      throw new TypeError(
        "snapshot.accessUrl must be a valid URL"
      );
    }

    return this.#transaction(async (client) => {
      const shipment = await client.query(
        `SELECT shipment_id
         FROM pdeca_shipments
         WHERE organization_id = $1
           AND shipment_id = $2
         FOR UPDATE`,
        [
          normalizedOrganizationId,
          normalizedShipmentId
        ]
      );

      if (!shipment.rows[0]) {
        throw conflict(
          "Shipment does not exist in this organization",
          "SHIPMENT_NOT_FOUND"
        );
      }

      const documentId =
        normalizedSnapshot.documentId;

      const duplicate = await client.query(
        `SELECT 1
         FROM pdeca_document_versions
         WHERE document_id = $1
            OR (shipment_id = $2 AND version = $3)`,
        [
          documentId,
          normalizedShipmentId,
          normalizedSnapshot.version
        ]
      );

      if (duplicate.rows[0]) {
        throw conflict(
          "Document version already exists",
          "DOCUMENT_VERSION_EXISTS"
        );
      }

      if (normalizedSnapshot.previousVersionId) {
        const previous = await client.query(
          `SELECT 1
           FROM pdeca_document_versions
           WHERE document_id = $1
             AND organization_id = $2
             AND shipment_id = $3`,
          [
            normalizedSnapshot.previousVersionId,
            normalizedOrganizationId,
            normalizedShipmentId
          ]
        );

        if (!previous.rows[0]) {
          throw conflict(
            "Previous document version does not belong to this shipment",
            "DOCUMENT_LINEAGE_INVALID"
          );
        }
      }

      const at = this.#nowIso();

      const result = await client.query(
        `INSERT INTO pdeca_document_versions
          (document_id, organization_id, shipment_id, version, previous_version_id, access_path, snapshot, artifact, stored_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
         RETURNING *`,
        [
          documentId,
          normalizedOrganizationId,
          normalizedShipmentId,
          normalizedSnapshot.version,
          normalizedSnapshot.previousVersionId ?? null,
          accessPath,
          JSON.stringify(normalizedSnapshot),
          JSON.stringify(normalizedArtifact),
          at
        ]
      );

      await client.query(
        `UPDATE pdeca_shipments
         SET updated_at = $3
         WHERE organization_id = $1
           AND shipment_id = $2`,
        [
          normalizedOrganizationId,
          normalizedShipmentId,
          at
        ]
      );

      await this.#appendAudit(client, {
        organizationId: normalizedOrganizationId,
        shipmentId: normalizedShipmentId,
        documentId,
        type: "document.version.created",
        at
      });

      return documentFromRow(result.rows[0]);
    });
  }

  async getDocumentVersion({
    organizationId,
    documentId
  }) {
    const result = await this.#pool.query(
      `SELECT *
       FROM pdeca_document_versions
       WHERE organization_id = $1
         AND document_id = $2`,
      [
        requireText(
          organizationId,
          "organizationId"
        ),
        requireText(
          documentId,
          "documentId"
        )
      ]
    );

    return result.rows[0]
      ? documentFromRow(result.rows[0])
      : null;
  }

  async findDocumentVersionByAccessPath(pathname) {
    const normalizedPathname = requireText(
      pathname,
      "pathname"
    );

    const result = await this.#pool.query(
      `SELECT *
       FROM pdeca_document_versions
       WHERE access_path = $1
       LIMIT 1`,
      [normalizedPathname]
    );

    return result.rows[0]
      ? documentFromRow(result.rows[0])
      : null;
  }

  async listAuditEvents({
    organizationId,
    shipmentId = null
  }) {
    const normalizedOrganizationId = requireText(
      organizationId,
      "organizationId"
    );
    const normalizedShipmentId =
      shipmentId === null
        ? null
        : requireText(shipmentId, "shipmentId");

    const result = await this.#pool.query(
      `SELECT *
       FROM pdeca_audit_events
       WHERE organization_id = $1
         AND ($2::text IS NULL OR shipment_id = $2)
       ORDER BY at, event_id`,
      [
        normalizedOrganizationId,
        normalizedShipmentId
      ]
    );

    return result.rows.map(auditFromRow);
  }
}
