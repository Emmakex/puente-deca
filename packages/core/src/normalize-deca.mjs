const trim = (value) =>
  typeof value === "string" ? value.trim() : value;

const upper = (value) =>
  typeof value === "string" ? value.trim().toUpperCase() : value;

const registration = (value) =>
  typeof value === "string"
    ? value.trim().toUpperCase().replace(/\s+/g, "")
    : value;

export function normalizeDecaRequest(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const shipper = input.contractualShipper ?? {};
  const carrier = input.effectiveCarrier ?? {};
  const route = input.route ?? {};
  const goods = input.goods ?? {};
  const transport = input.transport ?? {};
  const vehicle = transport.vehicle ?? {};

  return {
    ...input,
    externalReference: trim(input.externalReference),
    contractualShipper: {
      ...shipper,
      legalName: trim(shipper.legalName),
      taxId: upper(shipper.taxId),
      address: trim(shipper.address)
    },
    effectiveCarrier: {
      ...carrier,
      legalName: trim(carrier.legalName),
      taxId: upper(carrier.taxId)
    },
    route: {
      ...route,
      origin: trim(route.origin),
      destination: trim(route.destination)
    },
    goods: {
      ...goods,
      nature: trim(goods.nature),
      weight:
        goods.weight && typeof goods.weight === "object"
          ? {
              ...goods.weight,
              unit: trim(goods.weight.unit)
            }
          : goods.weight,
      alternativeMeasure:
        goods.alternativeMeasure &&
        typeof goods.alternativeMeasure === "object"
          ? {
              ...goods.alternativeMeasure,
              unit: trim(goods.alternativeMeasure.unit)
            }
          : goods.alternativeMeasure
    },
    transport: {
      ...transport,
      date: trim(transport.date),
      specialTrafficAuthorization: trim(
        transport.specialTrafficAuthorization
      ),
      vehicle: {
        ...vehicle,
        tractorRegistration: registration(vehicle.tractorRegistration),
        trailerRegistration: registration(vehicle.trailerRegistration)
      }
    },
    observations: trim(input.observations)
  };
}
