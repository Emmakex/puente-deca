import {
  mkdir,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";
import { dirname } from "node:path";
import {
  createHash,
  randomUUID
} from "node:crypto";
import { canonicalJson } from "../../core/src/canonical-json.mjs";

const initialState = () => ({
  schemaVersion: 1,
  organizations: {},
  shipments: {},
  documentVersions: {},
  auditEvents: [],
  idempotency: {}
});

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

const fingerprint = (value) =>
  `sha256:${createHash("sha256")
    .update(canonicalJson(value))
    .digest("hex")}`;

const conflict = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

export class JsonStore {
  #filePath;
  #now;
  #idFactory;
  #writeQueue = Promise.resolve();

  constructor({
    filePath,
    now = () => new Date(),
    idFactory = randomUUID
  }) {
    this.#filePath = requireText(filePath, "filePath");
    this.#now = now;
    this.#idFactory = idFactory;
  }

  static async open(options) {
    const store = new JsonStore(options);
    await store.#ensureFile();
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

  async #ensureFile() {
    await mkdir(dirname(this.#filePath), { recursive: true });

    try {
      await readFile(this.#filePath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await this.#atomicWrite(initialState());
    }
  }

  async #readState() {
    await this.#writeQueue;

    const raw = await readFile(this.#filePath, "utf8");
    const parsed = JSON.parse(raw);

    if (parsed?.schemaVersion !== 1) {
      throw conflict(
        "Unsupported persistence schema version",
        "STORE_SCHEMA_UNSUPPORTED"
      );
    }

    return parsed;
  }

  async #atomicWrite(state) {
    const temporaryPath =
      `${this.#filePath}.${process.pid}.${randomUUID()}.tmp`;

    await writeFile(
      temporaryPath,
      `${JSON.stringify(state, null, 2)}\n`,
      "utf8"
    );
    await rename(temporaryPath, this.#filePath);
  }

  #mutate(mutator) {
    const operation = this.#writeQueue.then(async () => {
      const raw = await readFile(this.#filePath, "utf8");
      const state = JSON.parse(raw);

      if (state?.schemaVersion !== 1) {
        throw conflict(
          "Unsupported persistence schema version",
          "STORE_SCHEMA_UNSUPPORTED"
        );
      }

      const result = await mutator(state);
      await this.#atomicWrite(state);
      return clone(result);
    });

    this.#writeQueue = operation.then(
      () => undefined,
      () => undefined
    );

    return operation;
  }

  #appendAudit(
    state,
    {
      organizationId,
      shipmentId = null,
      documentId = null,
      type,
      at
    }
  ) {
    const event = {
      eventId: `evt_${this.#idFactory()}`,
      organizationId,
      shipmentId,
      documentId,
      type,
      at
    };

    state.auditEvents.push(event);
    return event;
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

    return this.#mutate((state) => {
      const at = this.#nowIso();
      const organizationId = `org_${this.#idFactory()}`;

      const organization = {
        organizationId,
        name: normalizedName,
        externalReference: normalizedExternalReference,
        createdAt: at,
        updatedAt: at
      };

      state.organizations[organizationId] = organization;

      this.#appendAudit(state, {
        organizationId,
        type: "organization.created",
        at
      });

      return organization;
    });
  }

  async getOrganization(organizationId) {
    const normalizedId = requireText(
      organizationId,
      "organizationId"
    );
    const state = await this.#readState();
    const organization =
      state.organizations[normalizedId] ?? null;

    return organization ? clone(organization) : null;
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

    return this.#mutate((state) => {
      if (!state.organizations[normalizedOrganizationId]) {
        throw conflict(
          "Organization does not exist",
          "ORGANIZATION_NOT_FOUND"
        );
      }

      const requestFingerprint = fingerprint({
        externalReference: normalizedExternalReference,
        data: normalizedData
      });

      if (normalizedIdempotencyKey) {
        const scope =
          `${normalizedOrganizationId}:shipment:create:${normalizedIdempotencyKey}`;
        const existing = state.idempotency[scope];

        if (existing) {
          if (existing.fingerprint !== requestFingerprint) {
            throw conflict(
              "Idempotency key was already used with different data",
              "IDEMPOTENCY_CONFLICT"
            );
          }

          const shipment =
            state.shipments[existing.shipmentId];

          return {
            ...shipment,
            idempotentReplay: true
          };
        }
      }

      const at = this.#nowIso();
      const shipmentId = `shp_${this.#idFactory()}`;

      const shipment = {
        shipmentId,
        organizationId: normalizedOrganizationId,
        externalReference: normalizedExternalReference,
        data: clone(normalizedData),
        documentVersionIds: [],
        createdAt: at,
        updatedAt: at
      };

      state.shipments[shipmentId] = shipment;

      if (normalizedIdempotencyKey) {
        const scope =
          `${normalizedOrganizationId}:shipment:create:${normalizedIdempotencyKey}`;

        state.idempotency[scope] = {
          shipmentId,
          fingerprint: requestFingerprint,
          createdAt: at
        };
      }

      this.#appendAudit(state, {
        organizationId: normalizedOrganizationId,
        shipmentId,
        type: "shipment.created",
        at
      });

      return {
        ...shipment,
        idempotentReplay: false
      };
    });
  }

  async getShipment({
    organizationId,
    shipmentId
  }) {
    const normalizedOrganizationId = requireText(
      organizationId,
      "organizationId"
    );
    const normalizedShipmentId = requireText(
      shipmentId,
      "shipmentId"
    );

    const state = await this.#readState();
    const shipment =
      state.shipments[normalizedShipmentId] ?? null;

    if (
      !shipment ||
      shipment.organizationId !== normalizedOrganizationId
    ) {
      return null;
    }

    return clone(shipment);
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

    return this.#mutate((state) => {
      const shipment =
        state.shipments[normalizedShipmentId];

      if (
        !shipment ||
        shipment.organizationId !== normalizedOrganizationId
      ) {
        throw conflict(
          "Shipment does not exist in this organization",
          "SHIPMENT_NOT_FOUND"
        );
      }

      const documentId =
        normalizedSnapshot.documentId;

      if (state.documentVersions[documentId]) {
        throw conflict(
          "Document version already exists",
          "DOCUMENT_VERSION_EXISTS"
        );
      }

      if (normalizedSnapshot.previousVersionId) {
        const previous =
          state.documentVersions[
            normalizedSnapshot.previousVersionId
          ];

        if (
          !previous ||
          previous.organizationId !==
            normalizedOrganizationId ||
          previous.shipmentId !== normalizedShipmentId
        ) {
          throw conflict(
            "Previous document version does not belong to this shipment",
            "DOCUMENT_LINEAGE_INVALID"
          );
        }
      }

      const at = this.#nowIso();

      const version = {
        organizationId: normalizedOrganizationId,
        shipmentId: normalizedShipmentId,
        documentId,
        version: normalizedSnapshot.version,
        snapshot: clone(normalizedSnapshot),
        artifact: clone(normalizedArtifact),
        storedAt: at
      };

      state.documentVersions[documentId] = version;
      shipment.documentVersionIds.push(documentId);
      shipment.updatedAt = at;

      this.#appendAudit(state, {
        organizationId: normalizedOrganizationId,
        shipmentId: normalizedShipmentId,
        documentId,
        type: "document.version.created",
        at
      });

      return version;
    });
  }

  async getDocumentVersion({
    organizationId,
    documentId
  }) {
    const normalizedOrganizationId = requireText(
      organizationId,
      "organizationId"
    );
    const normalizedDocumentId = requireText(
      documentId,
      "documentId"
    );

    const state = await this.#readState();
    const version =
      state.documentVersions[normalizedDocumentId] ?? null;

    if (
      !version ||
      version.organizationId !== normalizedOrganizationId
    ) {
      return null;
    }

    return clone(version);
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

    const state = await this.#readState();

    return clone(
      state.auditEvents.filter(
        (event) =>
          event.organizationId ===
            normalizedOrganizationId &&
          (
            normalizedShipmentId === null ||
            event.shipmentId === normalizedShipmentId
          )
      )
    );
  }
}
