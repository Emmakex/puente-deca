import {
  createHash,
  randomUUID
} from "node:crypto";
import { normalizeDecaRequest } from "../../core/src/normalize-deca.mjs";
import { validateDecaRequest } from "../../core/src/validate-deca.mjs";
import { DECA_CONTRACT_VERSION } from "../../contracts/src/deca.mjs";
import {
  buildDocumentAccessUrl,
  createAccessToken
} from "./access-url.mjs";
import { canonicalJson } from "./canonical-json.mjs";

const toIsoInstant = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Clock returned an invalid date");
  }

  return date.toISOString();
};

const contentHash = (data) =>
  `sha256:${createHash("sha256")
    .update(canonicalJson(data))
    .digest("hex")}`;

const validationError = (validation) => {
  const error = new Error("DeCA payload is not valid");
  error.code = "DECA_VALIDATION_FAILED";
  error.validation = validation;
  return error;
};

export function createDocumentSnapshot(
  input,
  {
    baseUrl,
    now = () => new Date(),
    idFactory = randomUUID,
    tokenFactory = createAccessToken
  } = {}
) {
  const normalized = normalizeDecaRequest(input);
  const validation = validateDecaRequest(normalized);

  if (!validation.valid) {
    throw validationError(validation);
  }

  const instant = toIsoInstant(now());
  const token = tokenFactory();
  const documentId = `deca_${idFactory()}`;

  return {
    schemaVersion: DECA_CONTRACT_VERSION,
    documentType: "DECA",
    documentId,
    version: 1,
    state: "prepared",
    createdAt: instant,
    modifiedAt: instant,
    lineageCreatedAt: instant,
    previousVersionId: null,
    revisionMethod: "new-file",
    contentHash: contentHash(normalized),
    accessUrl: buildDocumentAccessUrl({
      baseUrl,
      token
    }),
    data: normalized
  };
}

export function reviseDocumentSnapshot(
  previous,
  input,
  {
    baseUrl,
    now = () => new Date(),
    idFactory = randomUUID,
    tokenFactory = createAccessToken
  } = {}
) {
  if (
    previous === null ||
    typeof previous !== "object" ||
    previous.documentType !== "DECA" ||
    !Number.isInteger(previous.version) ||
    previous.version < 1 ||
    typeof previous.createdAt !== "string" ||
    typeof previous.documentId !== "string"
  ) {
    throw new TypeError("A valid previous DeCA snapshot is required");
  }

  const normalized = normalizeDecaRequest(input);
  const validation = validateDecaRequest(normalized);

  if (!validation.valid) {
    throw validationError(validation);
  }

  const instant = toIsoInstant(now());

  return {
    schemaVersion: DECA_CONTRACT_VERSION,
    documentType: "DECA",
    documentId: `deca_${idFactory()}`,
    version: previous.version + 1,
    state: "prepared",
    createdAt: instant,
    modifiedAt: instant,
    lineageCreatedAt:
      previous.lineageCreatedAt ?? previous.createdAt,
    previousVersionId: previous.documentId,
    revisionMethod: "new-file",
    contentHash: contentHash(normalized),
    accessUrl: buildDocumentAccessUrl({
      baseUrl,
      token: tokenFactory()
    }),
    data: normalized
  };
}
