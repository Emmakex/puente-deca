const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasText = (value) =>
  typeof value === "string" && value.trim().length > 0;

const isIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
};

const error = (path, code, message, responsibleParty = null) => ({
  path,
  code,
  message,
  responsibleParty
});

const pushRequired = (
  errors,
  path,
  value,
  responsibleParty
) => {
  if (!hasText(value)) {
    errors.push(
      error(path, "required", "Required field", responsibleParty)
    );
  }
};

export function validateDecaRequest(input) {
  const errors = [];

  if (!isRecord(input)) {
    return {
      valid: false,
      errors: [
        error("$", "invalid_type", "Expected an object")
      ]
    };
  }

  const shipper = input.contractualShipper;
  if (!isRecord(shipper)) {
    errors.push(
      error(
        "contractualShipper",
        "required",
        "Contractual shipper is required",
        "contractual_shipper"
      )
    );
  } else {
    pushRequired(
      errors,
      "contractualShipper.legalName",
      shipper.legalName,
      "contractual_shipper"
    );
    pushRequired(
      errors,
      "contractualShipper.taxId",
      shipper.taxId,
      "contractual_shipper"
    );
    pushRequired(
      errors,
      "contractualShipper.address",
      shipper.address,
      "contractual_shipper"
    );
  }

  const carrier = input.effectiveCarrier;
  if (!isRecord(carrier)) {
    errors.push(
      error(
        "effectiveCarrier",
        "required",
        "Effective carrier is required",
        "contractual_shipper"
      )
    );
  } else {
    pushRequired(
      errors,
      "effectiveCarrier.legalName",
      carrier.legalName,
      "contractual_shipper"
    );
    pushRequired(
      errors,
      "effectiveCarrier.taxId",
      carrier.taxId,
      "contractual_shipper"
    );
  }

  const route = input.route;
  if (!isRecord(route)) {
    errors.push(
      error(
        "route",
        "required",
        "Route is required",
        "contractual_shipper"
      )
    );
  } else {
    pushRequired(
      errors,
      "route.origin",
      route.origin,
      "contractual_shipper"
    );
    pushRequired(
      errors,
      "route.destination",
      route.destination,
      "contractual_shipper"
    );
  }

  const goods = input.goods;
  if (!isRecord(goods)) {
    errors.push(
      error(
        "goods",
        "required",
        "Goods are required",
        "contractual_shipper"
      )
    );
  } else {
    pushRequired(
      errors,
      "goods.nature",
      goods.nature,
      "contractual_shipper"
    );

    const weight = goods.weight;
    const alternativeMeasure = goods.alternativeMeasure;

    const hasValidWeight =
      isRecord(weight) &&
      Number.isFinite(weight.value) &&
      weight.value > 0 &&
      hasText(weight.unit);

    const hasAlternativeMeasure =
      isRecord(alternativeMeasure) &&
      Number.isFinite(alternativeMeasure.value) &&
      alternativeMeasure.value > 0 &&
      hasText(alternativeMeasure.unit);

    if (!hasValidWeight && !hasAlternativeMeasure) {
      errors.push(
        error(
          "goods.weight",
          "required",
          "A positive weight or alternative measure is required",
          "contractual_shipper"
        )
      );
    }
  }

  const transport = input.transport;
  if (!isRecord(transport)) {
    errors.push(
      error(
        "transport",
        "required",
        "Transport data is required",
        "effective_carrier"
      )
    );
  } else {
    if (!isIsoDate(transport.date)) {
      errors.push(
        error(
          "transport.date",
          "invalid_date",
          "Transport date must use YYYY-MM-DD",
          "effective_carrier"
        )
      );
    }

    const vehicle = transport.vehicle;
    if (!isRecord(vehicle)) {
      errors.push(
        error(
          "transport.vehicle",
          "required",
          "Vehicle is required",
          "effective_carrier"
        )
      );
    } else {
      pushRequired(
        errors,
        "transport.vehicle.tractorRegistration",
        vehicle.tractorRegistration,
        "effective_carrier"
      );
    }

    if (
      transport.specialTrafficAuthorization !== null &&
      transport.specialTrafficAuthorization !== undefined &&
      !hasText(transport.specialTrafficAuthorization)
    ) {
      errors.push(
        error(
          "transport.specialTrafficAuthorization",
          "invalid_value",
          "Special traffic authorization must be text or null",
          "effective_carrier"
        )
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
