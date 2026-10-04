import {
  DECA_CONTRACT_VERSION
} from "../../contracts/src/deca.mjs";
import {
  SHIPMENT_CONTRACT_VERSION
} from "../../contracts/src/shipment.mjs";

const record = (
  value,
  fallback = {}
) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value)
    ? value
    : fallback;

const partyFromDeca = (
  role,
  value
) => ({
  ...record(value),
  role
});

const decaParty = (
  parties,
  role
) => {
  const party =
    Array.isArray(parties)
      ? parties.find(
          (entry) =>
            entry?.role === role
        )
      : null;

  if (!party) {
    return {};
  }

  const {
    role: _role,
    ...value
  } = party;

  return value;
};

export function shipmentAggregateFromDeca(
  input
) {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new TypeError(
      "DeCA request must be an object"
    );
  }

  const {
    externalReference,
    contractualShipper,
    effectiveCarrier,
    route,
    goods,
    transport,
    observations,
    ...requestExtensions
  } = input;

  const normalizedGoods =
    record(goods);
  const {
    nature,
    weight,
    alternativeMeasure,
    ...cargoExtensions
  } = normalizedGoods;

  const measures = [];

  if (
    weight &&
    typeof weight === "object" &&
    !Array.isArray(weight)
  ) {
    measures.push({
      kind: "weight",
      ...weight
    });
  }

  if (
    alternativeMeasure &&
    typeof alternativeMeasure ===
      "object" &&
    !Array.isArray(
      alternativeMeasure
    )
  ) {
    measures.push({
      kind:
        "alternative_measure",
      ...alternativeMeasure
    });
  }

  const normalizedTransport =
    record(transport);
  const {
    date,
    vehicle,
    specialTrafficAuthorization,
    ...movementExtensions
  } = normalizedTransport;

  return {
    contractVersion:
      SHIPMENT_CONTRACT_VERSION,
    externalReference,
    transportMode: "road",
    parties: [
      partyFromDeca(
        "contractual_shipper",
        contractualShipper
      ),
      partyFromDeca(
        "effective_carrier",
        effectiveCarrier
      )
    ],
    route: {
      ...record(route)
    },
    cargo: {
      ...cargoExtensions,
      nature,
      measures
    },
    movement: {
      ...movementExtensions,
      date,
      equipment: {
        ...record(vehicle)
      },
      authorizations: {
        specialTrafficAuthorization:
          specialTrafficAuthorization ??
          null
      }
    },
    notes:
      observations ?? null,
    regulatoryContexts: [
      {
        type: "deca",
        contractVersion:
          DECA_CONTRACT_VERSION
      }
    ],
    extensions: {
      deca: {
        request:
          requestExtensions
      }
    }
  };
}

export function decaRequestFromShipmentAggregate(
  shipment
) {
  if (
    shipment === null ||
    typeof shipment !==
      "object" ||
    Array.isArray(shipment)
  ) {
    throw new TypeError(
      "Shipment aggregate must be an object"
    );
  }

  const cargo =
    record(shipment.cargo);
  const measures =
    Array.isArray(
      cargo.measures
    )
      ? cargo.measures
      : [];

  const weight =
    measures.find(
      (measure) =>
        measure?.kind ===
        "weight"
    );
  const alternativeMeasure =
    measures.find(
      (measure) =>
        measure?.kind ===
        "alternative_measure"
    );

  const {
    measures: _measures,
    ...cargoBase
  } = cargo;

  const movement =
    record(shipment.movement);
  const {
    equipment,
    authorizations,
    ...movementBase
  } = movement;

  const stripKind = (
    measure
  ) => {
    if (!measure) return null;
    const {
      kind: _kind,
      ...value
    } = measure;
    return value;
  };

  const decaExtensions =
    record(
      record(
        shipment.extensions
      ).deca
    );
  const requestExtensions =
    record(
      decaExtensions.request
    );

  const goods = {
    ...cargoBase
  };

  const normalizedWeight =
    stripKind(weight);
  const normalizedAlternative =
    stripKind(
      alternativeMeasure
    );

  if (normalizedWeight) {
    goods.weight =
      normalizedWeight;
  }

  if (
    normalizedAlternative
  ) {
    goods.alternativeMeasure =
      normalizedAlternative;
  }

  return {
    ...requestExtensions,
    externalReference:
      shipment.externalReference,
    contractualShipper:
      decaParty(
        shipment.parties,
        "contractual_shipper"
      ),
    effectiveCarrier:
      decaParty(
        shipment.parties,
        "effective_carrier"
      ),
    route: {
      ...record(
        shipment.route
      )
    },
    goods,
    transport: {
      ...movementBase,
      vehicle: {
        ...record(
          equipment
        )
      },
      specialTrafficAuthorization:
        record(
          authorizations
        )
          .specialTrafficAuthorization ??
        null
    },
    observations:
      shipment.notes ?? null
  };
}
