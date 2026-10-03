import {
  normalizeDecaRequest
} from "../../core/src/normalize-deca.mjs";
import {
  validateDecaRequest
} from "../../core/src/validate-deca.mjs";

const requireText = (value, name) => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      `Connector ${name} must be a non-empty string`
    );
  }
};

export async function runConnectorContract({
  connector,
  fixture
}) {
  if (
    connector === null ||
    typeof connector !== "object"
  ) {
    throw new TypeError(
      "Connector module must export an object"
    );
  }

  requireText(connector.id, "id");
  requireText(connector.version, "version");

  if (
    !Array.isArray(connector.capabilities) ||
    !connector.capabilities.includes(
      "shipment.import"
    )
  ) {
    throw new TypeError(
      "Connector must declare shipment.import capability"
    );
  }

  if (
    typeof connector.mapShipment !==
    "function"
  ) {
    throw new TypeError(
      "Connector must implement mapShipment(source)"
    );
  }

  const sourceBefore =
    structuredClone(fixture);
  const mapped =
    await connector.mapShipment(fixture);

  if (
    JSON.stringify(fixture) !==
    JSON.stringify(sourceBefore)
  ) {
    throw new Error(
      "Connector must not mutate source data"
    );
  }

  if (
    mapped === null ||
    typeof mapped !== "object" ||
    Array.isArray(mapped)
  ) {
    throw new TypeError(
      "mapShipment must return an object"
    );
  }

  const normalized =
    normalizeDecaRequest(mapped);
  const validation =
    validateDecaRequest(normalized);

  if (
    typeof normalized.externalReference !==
      "string" ||
    normalized.externalReference.length === 0
  ) {
    validation.valid = false;
    validation.errors.push({
      path: "externalReference",
      code: "required",
      message:
        "External shipment reference is required"
    });
  }

  if (!validation.valid) {
    const error = new Error(
      `Connector ${connector.id} produced invalid DeCA data`
    );
    error.code =
      "CONNECTOR_CONTRACT_INVALID_OUTPUT";
    error.validation = validation;
    throw error;
  }

  return {
    id: connector.id,
    version: connector.version,
    capabilities: [
      ...connector.capabilities
    ],
    normalized
  };
}
