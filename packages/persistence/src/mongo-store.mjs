import {
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";
import {
  MongoClient,
  ServerApiVersion
} from "mongodb";
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
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("MongoDB returned an invalid timestamp");
  }
  return date.toISOString();
};

const publicCredential = (document) => ({
  credentialId: document.credentialId,
  organizationId: document.organizationId,
  name: document.name,
  keyPrefix: document.keyPrefix,
  scopes: [...document.scopes],
  createdAt: iso(document.createdAt),
  revokedAt: document.revokedAt
    ? iso(document.revokedAt)
    : null
});

const publicShipment = (document) => ({
  shipmentId: document.shipmentId,
  organizationId: document.organizationId,
  externalReference: document.externalReference,
  data: clone(document.data),
  documentVersionIds: [
    ...(document.documentVersionIds ?? [])
  ],
  createdAt: iso(document.createdAt),
  updatedAt: iso(document.updatedAt)
});

const publicDocument = (document) => ({
  organizationId: document.organizationId,
  shipmentId: document.shipmentId,
  documentId: document.documentId,
  version: document.version,
  snapshot: clone(document.snapshot),
  artifact: clone(document.artifact),
  storedAt: iso(document.storedAt)
});

const publicAudit = (document) => ({
  eventId: document.eventId,
  organizationId: document.organizationId,
  shipmentId: document.shipmentId ?? null,
  documentId: document.documentId ?? null,
  subjectId: document.subjectId ?? null,
  type: document.type,
  at: iso(document.at)
});

export class MongoStore {
  #client;
  #database;
  #ownsClient;
  #now;
  #idFactory;
  #apiKeyFactory;

  constructor({
    client,
    database,
    ownsClient = false,
    now = () => new Date(),
    idFactory = randomUUID,
    apiKeyFactory = () =>
      `pdeca_${randomBytes(32).toString("base64url")}`
  }) {
    if (!client || !database) {
      throw new TypeError("MongoDB client and database are required");
    }

    this.#client = client;
    this.#database = database;
    this.#ownsClient = ownsClient;
    this.#now = now;
    this.#idFactory = idFactory;
    this.#apiKeyFactory = apiKeyFactory;
  }

  static async open({
    uri,
    databaseName = "kairoseth",
    client = null,
    runIndexes = true,
    now,
    idFactory,
    apiKeyFactory
  } = {}) {
    const ownsClient = !client;
    const resolvedClient =
      client ??
      new MongoClient(
        requireText(uri, "uri"),
        {
          appName: "kairoseth-puente-deca",
          family: 4,
          connectTimeoutMS: 10_000,
          serverSelectionTimeoutMS: 10_000,
          serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true
          }
        }
      );

    if (ownsClient) {
      await resolvedClient.connect();
    }

    const store = new MongoStore({
      client: resolvedClient,
      database: resolvedClient.db(
        requireText(databaseName, "databaseName")
      ),
      ownsClient,
      now,
      idFactory,
      apiKeyFactory
    });

    if (runIndexes) {
      await store.ensureIndexes();
    }

    return store;
  }

  #nowDate() {
    const value = this.#now();
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new TypeError("Clock returned an invalid date");
    }

    return date;
  }

  get #organizations() {
    return this.#database.collection("deca_organizations");
  }

  get #credentials() {
    return this.#database.collection("deca_api_credentials");
  }

  get #shipments() {
    return this.#database.collection("deca_shipments");
  }

  get #documents() {
    return this.#database.collection("deca_document_versions");
  }

  get #idempotency() {
    return this.#database.collection("deca_idempotency");
  }

  get #audit() {
    return this.#database.collection("deca_audit_events");
  }

  get #artifactPurges() {
    return this.#database.collection("deca_artifact_purges");
  }

  async ensureIndexes() {
    await Promise.all([
      this.#organizations.createIndex(
        { organizationId: 1 },
        { unique: true, name: "organization_id_unique" }
      ),
      this.#credentials.createIndex(
        { credentialId: 1 },
        { unique: true, name: "credential_id_unique" }
      ),
      this.#credentials.createIndex(
        { keyHash: 1 },
        { unique: true, name: "credential_key_hash_unique" }
      ),
      this.#credentials.createIndex(
        { organizationId: 1, createdAt: -1 },
        { name: "credential_org_created" }
      ),
      this.#shipments.createIndex(
        { shipmentId: 1 },
        { unique: true, name: "shipment_id_unique" }
      ),
      this.#shipments.createIndex(
        { organizationId: 1, updatedAt: -1 },
        { name: "shipment_org_updated" }
      ),
      this.#documents.createIndex(
        { documentId: 1 },
        { unique: true, name: "document_id_unique" }
      ),
      this.#documents.createIndex(
        { shipmentId: 1, version: 1 },
        { unique: true, name: "document_lineage_unique" }
      ),
      this.#documents.createIndex(
        { accessPath: 1 },
        { unique: true, name: "document_access_path_unique" }
      ),
      this.#documents.createIndex(
        {
          "artifact.retentionNotBefore": 1,
          documentId: 1
        },
        { name: "document_retention_floor" }
      ),
      this.#idempotency.createIndex(
        { scope: 1 },
        { unique: true, name: "idempotency_scope_unique" }
      ),
      this.#audit.createIndex(
        { organizationId: 1, at: 1, eventId: 1 },
        { name: "audit_org_at" }
      ),
      this.#audit.createIndex(
        { organizationId: 1, shipmentId: 1, at: 1 },
        { name: "audit_shipment_at" }
      ),
      this.#artifactPurges.createIndex(
        { documentId: 1 },
        { unique: true, name: "artifact_purge_document_unique" }
      ),
      this.#artifactPurges.createIndex(
        { storageKey: 1 },
        { unique: true, name: "artifact_purge_storage_unique" }
      ),
      this.#artifactPurges.createIndex(
        { purgedAt: 1 },
        { name: "artifact_purge_at" }
      )
    ]);
  }

  async close() {
    if (this.#ownsClient) {
      await this.#client.close();
    }
  }

  async #withTransaction(operation) {
    const session = this.#client.startSession();

    try {
      return await session.withTransaction(
        async () => operation(session),
        {
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" }
        }
      );
    } finally {
      await session.endSession();
    }
  }

  async #appendAudit(
    {
      organizationId,
      shipmentId = null,
      documentId = null,
      subjectId = null,
      type,
      at
    },
    session
  ) {
    const event = {
      eventId: `evt_${this.#idFactory()}`,
      organizationId,
      shipmentId,
      documentId,
      subjectId,
      type,
      at
    };

    await this.#audit.insertOne(
      event,
      { session }
    );

    return event;
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

    const existing = await this.#organizations.findOne({
      organizationId: normalizedOrganizationId
    });

    if (existing) {
      return {
        organizationId: existing.organizationId,
        name: existing.name,
        externalReference: existing.externalReference ?? null,
        createdAt: iso(existing.createdAt),
        updatedAt: iso(existing.updatedAt)
      };
    }

    return this.#withTransaction(async (session) => {
      const at = this.#nowDate();
      const document = {
        organizationId: normalizedOrganizationId,
        name: normalizedName,
        externalReference: normalizedExternalReference,
        createdAt: at,
        updatedAt: at
      };

      try {
        await this.#organizations.insertOne(
          document,
          { session }
        );
      } catch (error) {
        if (error?.code === 11000) {
          const concurrent =
            await this.#organizations.findOne(
              {
                organizationId:
                  normalizedOrganizationId
              },
              { session }
            );

          if (concurrent) {
            return {
              organizationId:
                concurrent.organizationId,
              name: concurrent.name,
              externalReference:
                concurrent.externalReference ?? null,
              createdAt: iso(concurrent.createdAt),
              updatedAt: iso(concurrent.updatedAt)
            };
          }
        }
        throw error;
      }

      await this.#appendAudit(
        {
          organizationId:
            normalizedOrganizationId,
          type: "organization.provisioned",
          at
        },
        session
      );

      return {
        organizationId:
          normalizedOrganizationId,
        name: normalizedName,
        externalReference:
          normalizedExternalReference,
        createdAt: at.toISOString(),
        updatedAt: at.toISOString()
      };
    });
  }

  async createOrganization({
    name,
    externalReference = null
  }) {
    const organizationId =
      `org_${this.#idFactory()}`;

    return this.#withTransaction(async (session) => {
      const at = this.#nowDate();
      const document = {
        organizationId,
        name: requireText(name, "name"),
        externalReference:
          externalReference === null
            ? null
            : requireText(
                externalReference,
                "externalReference"
              ),
        createdAt: at,
        updatedAt: at
      };

      await this.#organizations.insertOne(
        document,
        { session }
      );

      await this.#appendAudit(
        {
          organizationId,
          type: "organization.created",
          at
        },
        session
      );

      return {
        ...document,
        createdAt: at.toISOString(),
        updatedAt: at.toISOString()
      };
    });
  }

  async getOrganization(organizationId) {
    const document =
      await this.#organizations.findOne({
        organizationId: requireText(
          organizationId,
          "organizationId"
        )
      });

    if (!document) return null;

    return {
      organizationId: document.organizationId,
      name: document.name,
      externalReference: document.externalReference ?? null,
      createdAt: iso(document.createdAt),
      updatedAt: iso(document.updatedAt)
    };
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
    const normalizedOrganizationId =
      requireText(
        organizationId,
        "organizationId"
      );
    const normalizedScopes =
      normalizeScopes(scopes);
    const apiKey = requireText(
      this.#apiKeyFactory(),
      "generated apiKey"
    );

    return this.#withTransaction(async (session) => {
      const organization =
        await this.#organizations.findOne(
          {
            organizationId:
              normalizedOrganizationId
          },
          { session }
        );

      if (!organization) {
        throw conflict(
          "Organization does not exist",
          "ORGANIZATION_NOT_FOUND"
        );
      }

      const at = this.#nowDate();
      const credentialId =
        `cred_${this.#idFactory()}`;

      const document = {
        credentialId,
        organizationId:
          normalizedOrganizationId,
        name: requireText(name, "name"),
        keyPrefix: apiKey.slice(0, 12),
        keyHash: hashApiKey(apiKey),
        scopes: normalizedScopes,
        createdAt: at,
        revokedAt: null
      };

      await this.#credentials.insertOne(
        document,
        { session }
      );

      await this.#appendAudit(
        {
          organizationId:
            normalizedOrganizationId,
          subjectId: credentialId,
          type: "api.credential.created",
          at
        },
        session
      );

      return {
        credential: publicCredential(document),
        apiKey
      };
    });
  }

  async listApiCredentials(organizationId) {
    const documents = await this.#credentials
      .find({
        organizationId: requireText(
          organizationId,
          "organizationId"
        )
      })
      .sort({ createdAt: -1, credentialId: -1 })
      .toArray();

    return documents.map(publicCredential);
  }

  async authenticateApiKey(apiKey) {
    if (
      typeof apiKey !== "string" ||
      apiKey.trim().length === 0
    ) {
      return null;
    }

    const document =
      await this.#credentials.findOne({
        keyHash: hashApiKey(apiKey.trim()),
        revokedAt: null
      });

    return document
      ? publicCredential(document)
      : null;
  }

  async revokeApiCredential({
    organizationId,
    credentialId
  }) {
    const normalizedOrganizationId =
      requireText(
        organizationId,
        "organizationId"
      );
    const normalizedCredentialId =
      requireText(
        credentialId,
        "credentialId"
      );

    return this.#withTransaction(async (session) => {
      const current =
        await this.#credentials.findOne(
          {
            organizationId:
              normalizedOrganizationId,
            credentialId:
              normalizedCredentialId
          },
          { session }
        );

      if (!current) {
        throw conflict(
          "API credential does not exist in this organization",
          "API_CREDENTIAL_NOT_FOUND"
        );
      }

      if (current.revokedAt) {
        return publicCredential(current);
      }

      const at = this.#nowDate();

      const result =
        await this.#credentials.findOneAndUpdate(
          {
            organizationId:
              normalizedOrganizationId,
            credentialId:
              normalizedCredentialId,
            revokedAt: null
          },
          {
            $set: { revokedAt: at }
          },
          {
            session,
            returnDocument: "after"
          }
        );

      await this.#appendAudit(
        {
          organizationId:
            normalizedOrganizationId,
          subjectId:
            normalizedCredentialId,
          type: "api.credential.revoked",
          at
        },
        session
      );

      return publicCredential(
        result ?? {
          ...current,
          revokedAt: at
        }
      );
    });
  }

  async createShipment({
    organizationId,
    externalReference,
    data,
    idempotencyKey = null
  }) {
    const normalizedOrganizationId =
      requireText(
        organizationId,
        "organizationId"
      );
    const normalizedExternalReference =
      requireText(
        externalReference,
        "externalReference"
      );
    const normalizedData =
      requireRecord(data, "data");
    const normalizedIdempotencyKey =
      idempotencyKey === null
        ? null
        : requireText(
            idempotencyKey,
            "idempotencyKey"
          );

    const requestFingerprint =
      fingerprint({
        externalReference:
          normalizedExternalReference,
        data: normalizedData
      });

    return this.#withTransaction(async (session) => {
      const organization =
        await this.#organizations.findOne(
          {
            organizationId:
              normalizedOrganizationId
          },
          { session }
        );

      if (!organization) {
        throw conflict(
          "Organization does not exist",
          "ORGANIZATION_NOT_FOUND"
        );
      }

      const scope =
        normalizedIdempotencyKey === null
          ? null
          : `${normalizedOrganizationId}:shipment:create:${normalizedIdempotencyKey}`;

      if (scope) {
        const existing =
          await this.#idempotency.findOne(
            { scope },
            { session }
          );

        if (existing) {
          if (
            existing.fingerprint !==
            requestFingerprint
          ) {
            throw conflict(
              "Idempotency key was already used with different data",
              "IDEMPOTENCY_CONFLICT"
            );
          }

          const shipment =
            await this.#shipments.findOne(
              {
                organizationId:
                  normalizedOrganizationId,
                shipmentId:
                  existing.shipmentId
              },
              { session }
            );

          return {
            ...publicShipment(shipment),
            idempotentReplay: true
          };
        }
      }

      const at = this.#nowDate();
      const shipmentId =
        `shp_${this.#idFactory()}`;

      const shipment = {
        shipmentId,
        organizationId:
          normalizedOrganizationId,
        externalReference:
          normalizedExternalReference,
        data: clone(normalizedData),
        documentVersionIds: [],
        createdAt: at,
        updatedAt: at
      };

      await this.#shipments.insertOne(
        shipment,
        { session }
      );

      if (scope) {
        try {
          await this.#idempotency.insertOne(
            {
              scope,
              organizationId:
                normalizedOrganizationId,
              shipmentId,
              fingerprint:
                requestFingerprint,
              createdAt: at
            },
            { session }
          );
        } catch (error) {
          if (error?.code === 11000) {
            throw conflict(
              "Idempotency key was concurrently used; retry the request",
              "IDEMPOTENCY_RETRY"
            );
          }
          throw error;
        }
      }

      await this.#appendAudit(
        {
          organizationId:
            normalizedOrganizationId,
          shipmentId,
          type: "shipment.created",
          at
        },
        session
      );

      return {
        ...publicShipment(shipment),
        idempotentReplay: false
      };
    });
  }

  async listShipments({
    organizationId,
    limit = 50
  }) {
    const normalizedOrganizationId =
      requireText(
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

    const [items, total] =
      await Promise.all([
        this.#shipments
          .find({
            organizationId:
              normalizedOrganizationId
          })
          .sort({
            updatedAt: -1,
            shipmentId: -1
          })
          .limit(normalizedLimit)
          .toArray(),
        this.#shipments.countDocuments({
          organizationId:
            normalizedOrganizationId
        })
      ]);

    return {
      items: items.map(publicShipment),
      total
    };
  }

  async getShipment({
    organizationId,
    shipmentId
  }) {
    const document =
      await this.#shipments.findOne({
        organizationId: requireText(
          organizationId,
          "organizationId"
        ),
        shipmentId: requireText(
          shipmentId,
          "shipmentId"
        )
      });

    return document
      ? publicShipment(document)
      : null;
  }

  async updateShipment({
    organizationId,
    shipmentId,
    data
  }) {
    const normalizedOrganizationId =
      requireText(
        organizationId,
        "organizationId"
      );
    const normalizedShipmentId =
      requireText(
        shipmentId,
        "shipmentId"
      );
    const normalizedData =
      requireRecord(data, "data");

    return this.#withTransaction(async (session) => {
      const current =
        await this.#shipments.findOne(
          {
            organizationId:
              normalizedOrganizationId,
            shipmentId:
              normalizedShipmentId
          },
          { session }
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
          ...publicShipment(current),
          changed: false
        };
      }

      const at = this.#nowDate();

      const updated =
        await this.#shipments.findOneAndUpdate(
          {
            organizationId:
              normalizedOrganizationId,
            shipmentId:
              normalizedShipmentId,
            updatedAt: current.updatedAt
          },
          {
            $set: {
              data: clone(normalizedData),
              updatedAt: at
            }
          },
          {
            session,
            returnDocument: "after"
          }
        );

      if (!updated) {
        throw conflict(
          "Shipment changed concurrently; retry the request",
          "SHIPMENT_CONFLICT"
        );
      }

      await this.#appendAudit(
        {
          organizationId:
            normalizedOrganizationId,
          shipmentId:
            normalizedShipmentId,
          type: "shipment.updated",
          at
        },
        session
      );

      return {
        ...publicShipment(updated),
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
    const normalizedOrganizationId =
      requireText(
        organizationId,
        "organizationId"
      );
    const normalizedShipmentId =
      requireText(
        shipmentId,
        "shipmentId"
      );
    const normalizedSnapshot =
      requireRecord(snapshot, "snapshot");
    const normalizedArtifact =
      requireRecord(artifact, "artifact");

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
        new URL(
          normalizedSnapshot.accessUrl
        ).pathname;
    } catch {
      throw new TypeError(
        "snapshot.accessUrl must be a valid URL"
      );
    }

    return this.#withTransaction(async (session) => {
      const shipment =
        await this.#shipments.findOne(
          {
            organizationId:
              normalizedOrganizationId,
            shipmentId:
              normalizedShipmentId
          },
          { session }
        );

      if (!shipment) {
        throw conflict(
          "Shipment does not exist in this organization",
          "SHIPMENT_NOT_FOUND"
        );
      }

      if (normalizedSnapshot.previousVersionId) {
        const previous =
          await this.#documents.findOne(
            {
              documentId:
                normalizedSnapshot.previousVersionId,
              organizationId:
                normalizedOrganizationId,
              shipmentId:
                normalizedShipmentId
            },
            { session }
          );

        if (!previous) {
          throw conflict(
            "Previous document version does not belong to this shipment",
            "DOCUMENT_LINEAGE_INVALID"
          );
        }
      }

      const at = this.#nowDate();
      const documentId =
        normalizedSnapshot.documentId;

      const document = {
        organizationId:
          normalizedOrganizationId,
        shipmentId:
          normalizedShipmentId,
        documentId,
        version:
          normalizedSnapshot.version,
        previousVersionId:
          normalizedSnapshot.previousVersionId ??
          null,
        accessPath,
        snapshot: clone(normalizedSnapshot),
        artifact: clone(normalizedArtifact),
        storedAt: at
      };

      try {
        await this.#documents.insertOne(
          document,
          { session }
        );
      } catch (error) {
        if (error?.code === 11000) {
          throw conflict(
            "Document version already exists",
            "DOCUMENT_VERSION_EXISTS"
          );
        }
        throw error;
      }

      const updatedShipment =
        await this.#shipments.updateOne(
          {
            organizationId:
              normalizedOrganizationId,
            shipmentId:
              normalizedShipmentId,
            documentVersionIds: {
              $ne: documentId
            }
          },
          {
            $push: {
              documentVersionIds:
                documentId
            },
            $set: {
              updatedAt: at
            }
          },
          { session }
        );

      if (updatedShipment.modifiedCount !== 1) {
        throw conflict(
          "Shipment document lineage changed concurrently",
          "DOCUMENT_LINEAGE_CONFLICT"
        );
      }

      await this.#appendAudit(
        {
          organizationId:
            normalizedOrganizationId,
          shipmentId:
            normalizedShipmentId,
          documentId,
          type: "document.version.created",
          at
        },
        session
      );

      return publicDocument(document);
    });
  }

  async getDocumentVersion({
    organizationId,
    documentId
  }) {
    const document =
      await this.#documents.findOne({
        organizationId: requireText(
          organizationId,
          "organizationId"
        ),
        documentId: requireText(
          documentId,
          "documentId"
        )
      });

    return document
      ? publicDocument(document)
      : null;
  }

  async findDocumentVersionByAccessPath(pathname) {
    const document =
      await this.#documents.findOne({
        accessPath: requireText(
          pathname,
          "pathname"
        )
      });

    return document
      ? publicDocument(document)
      : null;
  }


  async listArtifactReferences() {
    const documents = await this.#documents
      .find(
        {
          "artifact.storageKey": {
            $type: "string"
          },
          "artifact.retentionNotBefore": {
            $type: "string"
          }
        },
        {
          projection: {
            _id: 0,
            organizationId: 1,
            shipmentId: 1,
            documentId: 1,
            artifact: 1
          }
        }
      )
      .sort({ documentId: 1 })
      .toArray();

    return documents.map((document) => ({
      organizationId: document.organizationId,
      shipmentId: document.shipmentId,
      documentId: document.documentId,
      storageKey: document.artifact.storageKey,
      retentionNotBefore:
        document.artifact.retentionNotBefore,
      sha256: document.artifact.sha256 ?? null,
      size: document.artifact.size ?? null
    }));
  }

  async listRetentionEligibleArtifacts({
    asOf,
    limit = 100
  }) {
    const cutoff = new Date(asOf);

    if (Number.isNaN(cutoff.getTime())) {
      throw new TypeError("asOf must be a valid date");
    }

    const normalizedLimit = Math.min(
      1000,
      Math.max(
        1,
        Number.isInteger(limit) ? limit : 100
      )
    );

    const documents = await this.#documents
      .aggregate([
        {
          $match: {
            "artifact.storageKey": {
              $type: "string"
            },
            "artifact.retentionNotBefore": {
              $lte: cutoff.toISOString()
            }
          }
        },
        {
          $lookup: {
            from: "deca_artifact_purges",
            localField: "documentId",
            foreignField: "documentId",
            as: "purge"
          }
        },
        {
          $match: {
            "purge.0": {
              $exists: false
            }
          }
        },
        {
          $sort: {
            "artifact.retentionNotBefore": 1,
            documentId: 1
          }
        },
        {
          $limit: normalizedLimit
        }
      ])
      .toArray();

    return documents.map((document) => ({
      organizationId: document.organizationId,
      shipmentId: document.shipmentId,
      documentId: document.documentId,
      storageKey: document.artifact.storageKey,
      retentionNotBefore:
        document.artifact.retentionNotBefore,
      sha256: document.artifact.sha256 ?? null,
      size: document.artifact.size ?? null
    }));
  }

  async recordArtifactPurge({
    organizationId,
    shipmentId,
    documentId,
    storageKey,
    expectedRetentionNotBefore,
    artifactWasPresent,
    reason
  }) {
    const normalizedOrganizationId =
      requireText(
        organizationId,
        "organizationId"
      );
    const normalizedShipmentId =
      requireText(
        shipmentId,
        "shipmentId"
      );
    const normalizedDocumentId =
      requireText(
        documentId,
        "documentId"
      );
    const normalizedStorageKey =
      requireText(
        storageKey,
        "storageKey"
      );
    const normalizedFloor =
      requireText(
        expectedRetentionNotBefore,
        "expectedRetentionNotBefore"
      );
    const normalizedReason =
      requireText(reason, "reason");

    return this.#withTransaction(async (session) => {
      const existing =
        await this.#artifactPurges.findOne(
          {
            documentId:
              normalizedDocumentId
          },
          { session }
        );

      if (existing) {
        return {
          purgeId: existing.purgeId,
          organizationId: existing.organizationId,
          shipmentId: existing.shipmentId,
          documentId: existing.documentId,
          storageKey: existing.storageKey,
          retentionNotBefore:
            existing.retentionNotBefore,
          artifactWasPresent:
            Boolean(existing.artifactWasPresent),
          reason: existing.reason,
          purgedAt: iso(existing.purgedAt)
        };
      }

      const version =
        await this.#documents.findOne(
          {
            organizationId:
              normalizedOrganizationId,
            shipmentId:
              normalizedShipmentId,
            documentId:
              normalizedDocumentId
          },
          { session }
        );

      if (
        !version ||
        version.artifact?.storageKey !==
          normalizedStorageKey ||
        version.artifact?.retentionNotBefore !==
          normalizedFloor
      ) {
        throw conflict(
          "Artifact purge target does not match immutable document metadata",
          "ARTIFACT_PURGE_TARGET_MISMATCH"
        );
      }

      const floor = new Date(normalizedFloor);
      const at = this.#nowDate();

      if (
        Number.isNaN(floor.getTime()) ||
        floor > at
      ) {
        throw conflict(
          "Artifact is still inside the legal retention floor",
          "ARTIFACT_RETENTION_ACTIVE"
        );
      }

      const record = {
        purgeId:
          `purge_${this.#idFactory()}`,
        organizationId:
          normalizedOrganizationId,
        shipmentId:
          normalizedShipmentId,
        documentId:
          normalizedDocumentId,
        storageKey:
          normalizedStorageKey,
        retentionNotBefore:
          normalizedFloor,
        artifactWasPresent:
          Boolean(artifactWasPresent),
        reason: normalizedReason,
        purgedAt: at
      };

      await this.#artifactPurges.insertOne(
        record,
        { session }
      );

      await this.#appendAudit(
        {
          organizationId:
            normalizedOrganizationId,
          shipmentId:
            normalizedShipmentId,
          documentId:
            normalizedDocumentId,
          subjectId: record.purgeId,
          type: "artifact.retention.purged",
          at
        },
        session
      );

      return {
        ...record,
        purgedAt: at.toISOString()
      };
    });
  }

  async listArtifactPurgeRecords() {
    const documents = await this.#artifactPurges
      .find({})
      .sort({ purgedAt: 1, purgeId: 1 })
      .toArray();

    return documents.map((document) => ({
      purgeId: document.purgeId,
      organizationId: document.organizationId,
      shipmentId: document.shipmentId,
      documentId: document.documentId,
      storageKey: document.storageKey,
      retentionNotBefore:
        document.retentionNotBefore,
      artifactWasPresent:
        Boolean(document.artifactWasPresent),
      reason: document.reason,
      purgedAt: iso(document.purgedAt)
    }));
  }

  async listAuditEvents({
    organizationId,
    shipmentId = null
  }) {
    const filter = {
      organizationId: requireText(
        organizationId,
        "organizationId"
      )
    };

    if (shipmentId !== null) {
      filter.shipmentId = requireText(
        shipmentId,
        "shipmentId"
      );
    }

    const documents = await this.#audit
      .find(filter)
      .sort({ at: 1, eventId: 1 })
      .toArray();

    return documents.map(publicAudit);
  }
}
