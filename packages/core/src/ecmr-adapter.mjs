import {
  emptyEcmrProjection
} from "../../contracts/src/ecmr.mjs";
import {
  validateShipmentAggregate
} from "./validate-shipment.mjs";

const record = (
  value
) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value)
    ? value
    : {};

const text = (
  value
) =>
  typeof value === "string"
    ? value.trim()
    : "";

const resolveParty = (
  shipment,
  role
) => {
  if (
    !Array.isArray(
      shipment.parties
    )
  ) {
    return {};
  }

  return (
    shipment.parties.find(
      (party) =>
        party?.role === role
    ) ?? {}
  );
};

const partyView = (
  party
) => ({
  legalName:
    text(
      party.legalName ??
      party.name
    ),
  address:
    text(
      party.address
    )
});

const firstQuantity = (
  cargo
) => {
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

  const alternative =
    measures.find(
      (measure) =>
        measure?.kind ===
        "alternative_measure"
    );

  const selected =
    weight ?? alternative;

  if (!selected) {
    return null;
  }

  return {
    kind:
      selected.kind,
    value:
      selected.value ?? null,
    unit:
      text(selected.unit)
  };
};

export function ecmrProjectionFromShipment(
  shipment
) {
  const structural =
    validateShipmentAggregate(
      shipment
    );

  if (!structural.valid) {
    const error = new Error(
      "Shipment aggregate is not structurally valid"
    );
    error.code =
      "ECMR_SHIPMENT_INVALID";
    error.validationErrors =
      structural.errors;
    throw error;
  }

  const projection =
    emptyEcmrProjection();
  const extensions =
    record(
      shipment.extensions
    );
  const ecmr =
    record(
      extensions.ecmr
    );
  const roles =
    record(
      ecmr.partyRoles
    );
  const cargo =
    record(
      shipment.cargo
    );
  const ecmrGoods =
    record(
      ecmr.goods
    );

  const senderRole =
    text(
      roles.sender
    ) || "sender";
  const carrierRole =
    text(
      roles.contractualCarrier
    ) ||
    "contractual_carrier";
  const consigneeRole =
    text(
      roles.consignee
    ) || "consignee";

  const issue =
    record(
      ecmr.issue
    );
  const takingOver =
    record(
      ecmr.takingOver
    );
  const delivery =
    record(
      ecmr.delivery
    );
  const packages =
    record(
      ecmrGoods.packages
    );
  const charges =
    record(
      ecmr.charges
    );
  const customs =
    record(
      ecmr.customsFormalities
    );

  projection.externalReference =
    text(
      shipment.externalReference
    );
  projection.issue = {
    date:
      text(issue.date),
    place:
      text(issue.place)
  };
  projection.sender =
    partyView(
      resolveParty(
        shipment,
        senderRole
      )
    );
  projection.contractualCarrier =
    partyView(
      resolveParty(
        shipment,
        carrierRole
      )
    );
  projection.takingOver = {
    place:
      text(
        takingOver.place
      ),
    date:
      text(
        takingOver.date
      )
  };
  projection.delivery = {
    place:
      text(
        delivery.place
      )
  };
  projection.consignee =
    partyView(
      resolveParty(
        shipment,
        consigneeRole
      )
    );
  projection.goods = {
    nature:
      text(
        cargo.nature
      ),
    packingMethod:
      text(
        ecmrGoods
          .packingMethod
      ),
    packingMethodCode:
      text(
        ecmrGoods
          .packingMethodCode
      ) || null,
    dangerousGoodsDescription:
      ecmrGoods
        .dangerousGoodsDescription ==
      null
        ? null
        : text(
            ecmrGoods
              .dangerousGoodsDescription
          ),
    packages: {
      count:
        Number.isInteger(
          packages.count
        )
          ? packages.count
          : null,
      marksAndNumbers:
        Array.isArray(
          packages.marksAndNumbers
        )
          ? packages
              .marksAndNumbers
              .map(text)
              .filter(Boolean)
          : []
    },
    quantity:
      firstQuantity(
        cargo
      )
  };
  projection.charges = {
    declared:
      charges.declared ===
      true,
    items:
      Array.isArray(
        charges.items
      )
        ? charges.items.map(
            (entry) => {
              const charge =
                record(entry);
              const amount =
                record(
                  charge.amount
                );

              return {
                id:
                  text(charge.id) ||
                  null,
                description:
                  text(
                    charge.description
                  ) || null,
                chargeCategoryCode:
                  text(
                    charge
                      .chargeCategoryCode
                  ) || null,
                amount: {
                  value:
                    Number.isFinite(
                      amount.value
                    )
                      ? amount.value
                      : null,
                  currency:
                    text(
                      amount.currency
                    ) || null
                },
                payingPartyRoleCode:
                  text(
                    charge
                      .payingPartyRoleCode
                  ) || null,
                transportPaymentMethodCode:
                  text(
                    charge
                      .transportPaymentMethodCode
                  ) || null
              };
            }
          )
        : []
  };
  projection.customsFormalities = {
    declared:
      customs.declared ===
      true,
    instructions:
      Array.isArray(
        customs.instructions
      )
        ? customs
            .instructions
            .map(text)
            .filter(Boolean)
        : []
  };
  projection.conventionApplicability = {
    convention: "CMR",
    declared:
      record(
        ecmr
          .conventionApplicability
      ).declared === true
  };

  return projection;
}
