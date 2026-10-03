export const connector = {
  id: "woocommerce",
  version: "0.1.0",
  capabilities: ["shipment.import"],

  mapShipment(source) {
    const goods = {
      nature: source.items
        .map((item) => String(item.name ?? "").trim())
        .filter(Boolean)
        .join("; ")
    };

    if (
      Number.isFinite(source.weightKg) &&
      source.weightKg > 0
    ) {
      goods.weight = {
        value: source.weightKg,
        unit: "kg"
      };
    }

    return {
      externalReference:
        `woo:${source.blogId}:order:${source.orderId}`,
      contractualShipper: {
        legalName: source.shipper.legalName,
        taxId: source.shipper.taxId,
        address: source.shipper.address
      },
      effectiveCarrier: {
        legalName: source.carrier.legalName,
        taxId: source.carrier.taxId
      },
      route: {
        origin: source.origin,
        destination: source.destination
      },
      goods,
      transport: {
        date: source.transportDate,
        vehicle: {
          tractorRegistration:
            source.tractorRegistration,
          trailerRegistration:
            source.trailerRegistration ?? null
        },
        specialTrafficAuthorization:
          source.specialTrafficAuthorization ?? null
      },
      observations: source.observations ?? null
    };
  }
};
