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

const pushRequired = (errors, path, value) => {
  if (!hasText(value)) {
    errors.push({ path, code: "required", message: "Required field" });
  }
};

export function validateDecaRequest(input) {
  const errors = [];

  if (!isRecord(input)) {
    return {
      valid: false,
      errors: [{ path: "$", code: "invalid_type", message: "Expected an object" }]
    };
  }

  const shipper = input.contractualShipper;
  if (!isRecord(shipper)) {
    errors.push({
      path: "contractualShipper",
      code: "required",
      message: "Contractual shipper is required"
    });
  } else {
    pushRequired(errors, "contractualShipper.legalName", shipper.legalName);
    pushRequired(errors, "contractualShipper.taxId", shipper.taxId);
    pushRequired(errors, "contractualShipper.address", shipper.address);
  }

  const carrier = input.effectiveCarrier;
  if (!isRecord(carrier)) {
    errors.push({
      path: "effectiveCarrier",
      code: "required",
      message: "Effective carrier is required"
    });
  } else {
    pushRequired(errors, "effectiveCarrier.legalName", carrier.legalName);
    pushRequired(errors, "effectiveCarrier.taxId", carrier.taxId);
  }

  const route = input.route;
  if (!isRecord(route)) {
    errors.push({ path: "route", code: "required", message: "Route is required" });
  } else {
    pushRequired(errors, "route.origin", route.origin);
    pushRequired(errors, "route.destination", route.destination);
  }

  const goods = input.goods;
  if (!isRecord(goods)) {
    errors.push({ path: "goods", code: "required", message: "Goods are required" });
  } else {
    pushRequired(errors, "goods.nature", goods.nature);

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
      errors.push({
        path: "goods.weight",
        code: "required",
        message: "A positive weight or alternative measure is required"
      });
    }
  }

  const transport = input.transport;
  if (!isRecord(transport)) {
    errors.push({
      path: "transport",
      code: "required",
      message: "Transport data is required"
    });
  } else {
    if (!isIsoDate(transport.date)) {
      errors.push({
        path: "transport.date",
        code: "invalid_date",
        message: "Transport date must use YYYY-MM-DD"
      });
    }

    const vehicle = transport.vehicle;
    if (!isRecord(vehicle)) {
      errors.push({
        path: "transport.vehicle",
        code: "required",
        message: "Vehicle is required"
      });
    } else {
      pushRequired(
        errors,
        "transport.vehicle.tractorRegistration",
        vehicle.tractorRegistration
      );
    }

    if (
      transport.specialTrafficAuthorization !== null &&
      transport.specialTrafficAuthorization !== undefined &&
      !hasText(transport.specialTrafficAuthorization)
    ) {
      errors.push({
        path: "transport.specialTrafficAuthorization",
        code: "invalid_value",
        message: "Special traffic authorization must be text or null"
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
