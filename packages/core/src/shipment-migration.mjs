import {
  normalizeDecaRequest
} from "./normalize-deca.mjs";
import {
  validateDecaRequest
} from "./validate-deca.mjs";
import {
  shipmentAggregateFromDeca
} from "./shipment-adapter.mjs";
import {
  validateShipmentAggregate
} from "./validate-shipment.mjs";

const migrationError = (
  code,
  message,
  details = {}
) =>
  Object.assign(
    new Error(message),
    {
      code,
      ...details
    }
  );

export function buildAggregateForLegacyShipment(
  shipment
) {
  if (
    shipment === null ||
    typeof shipment !== "object" ||
    Array.isArray(shipment)
  ) {
    throw migrationError(
      "SHIPMENT_MIGRATION_RECORD_INVALID",
      "Shipment record must be an object"
    );
  }

  if (
    shipment.aggregate !==
      undefined &&
    shipment.aggregate !== null
  ) {
    throw migrationError(
      "SHIPMENT_MIGRATION_ALREADY_COMPLETE",
      "Shipment already contains an aggregate"
    );
  }

  if (
    shipment.data === null ||
    typeof shipment.data !== "object" ||
    Array.isArray(shipment.data)
  ) {
    throw migrationError(
      "SHIPMENT_MIGRATION_DATA_INVALID",
      "Legacy shipment data must be an object"
    );
  }

  const normalized =
    normalizeDecaRequest(
      shipment.data
    );
  const decaValidation =
    validateDecaRequest(
      normalized
    );

  if (!decaValidation.valid) {
    throw migrationError(
      "SHIPMENT_MIGRATION_DECA_INVALID",
      "Legacy shipment data is not a valid canonical DeCA request",
      {
        validationErrors:
          decaValidation.errors
      }
    );
  }

  if (
    typeof shipment.externalReference ===
      "string" &&
    shipment.externalReference.trim()
      .length > 0 &&
    normalized.externalReference !==
      shipment.externalReference.trim()
  ) {
    throw migrationError(
      "SHIPMENT_MIGRATION_REFERENCE_MISMATCH",
      "Shipment externalReference does not match persisted DeCA data"
    );
  }

  const aggregate =
    shipmentAggregateFromDeca(
      normalized
    );
  const aggregateValidation =
    validateShipmentAggregate(
      aggregate
    );

  if (
    !aggregateValidation.valid
  ) {
    throw migrationError(
      "SHIPMENT_MIGRATION_AGGREGATE_INVALID",
      "Generated Shipment aggregate failed structural validation",
      {
        validationErrors:
          aggregateValidation.errors
      }
    );
  }

  return {
    normalizedData:
      normalized,
    aggregate
  };
}
