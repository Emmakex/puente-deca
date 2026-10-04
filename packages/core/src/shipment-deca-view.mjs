import {
  normalizeDecaRequest
} from "./normalize-deca.mjs";
import {
  validateDecaRequest
} from "./validate-deca.mjs";
import {
  decaRequestFromShipmentAggregate
} from "./shipment-adapter.mjs";
import {
  validateShipmentAggregate
} from "./validate-shipment.mjs";

const fail = (
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

const validateResolvedDeca = (
  request,
  source
) => {
  const normalized =
    normalizeDecaRequest(
      request
    );
  const validation =
    validateDecaRequest(
      normalized
    );

  if (!validation.valid) {
    throw fail(
      source === "aggregate"
        ? "SHIPMENT_AGGREGATE_DECA_INVALID"
        : "SHIPMENT_LEGACY_DATA_INVALID",
      "Resolved shipment data is not a valid DeCA request",
      {
        validationErrors:
          validation.errors
      }
    );
  }

  return normalized;
};

export function resolveDecaRequestFromShipment(
  shipment
) {
  if (
    shipment === null ||
    typeof shipment !== "object" ||
    Array.isArray(shipment)
  ) {
    throw fail(
      "SHIPMENT_VIEW_INVALID",
      "Shipment must be an object"
    );
  }

  const hasAggregate =
    shipment.aggregate !==
      undefined &&
    shipment.aggregate !== null;

  let source;
  let request;

  if (hasAggregate) {
    const aggregateValidation =
      validateShipmentAggregate(
        shipment.aggregate
      );

    if (
      !aggregateValidation.valid
    ) {
      throw fail(
        "SHIPMENT_AGGREGATE_INVALID",
        "Persisted Shipment aggregate failed structural validation",
        {
          validationErrors:
            aggregateValidation.errors
        }
      );
    }

    source = "aggregate";
    request =
      decaRequestFromShipmentAggregate(
        shipment.aggregate
      );
  } else {
    source = "legacy-data";

    if (
      shipment.data === null ||
      typeof shipment.data !==
        "object" ||
      Array.isArray(
        shipment.data
      )
    ) {
      throw fail(
        "SHIPMENT_LEGACY_DATA_INVALID",
        "Legacy shipment data must be an object"
      );
    }

    request =
      shipment.data;
  }

  const normalized =
    validateResolvedDeca(
      request,
      source
    );

  if (
    typeof shipment.externalReference ===
      "string" &&
    shipment.externalReference.trim()
      .length > 0 &&
    normalized.externalReference !==
      shipment.externalReference.trim()
  ) {
    throw fail(
      "SHIPMENT_VIEW_REFERENCE_MISMATCH",
      "Resolved shipment externalReference does not match the persisted shipment record"
    );
  }

  return {
    source,
    request:
      normalized
  };
}
