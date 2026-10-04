import {
  ECMR_UNCEFACT_RELEASE
} from "../../contracts/src/ecmr.mjs";
import {
  validateShipmentAggregate
} from "./validate-shipment.mjs";
import {
  ecmrProjectionFromShipment
} from "./ecmr-adapter.mjs";
import {
  validateEcmrProjection
} from "./validate-ecmr.mjs";

const isRecord = (
  value
) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const record = (
  value
) =>
  isRecord(value)
    ? value
    : {};

const text = (
  value
) =>
  typeof value === "string"
    ? value.trim()
    : "";

const nullableText = (
  value
) => {
  const normalized =
    text(value);

  return normalized ||
    null;
};

const stringList = (
  value
) =>
  Array.isArray(value)
    ? value
        .map(text)
        .filter(Boolean)
    : [];

const explicitParty = (
  role,
  value
) => {
  const party =
    record(value);

  return {
    role,
    legalName:
      text(
        party.legalName
      ),
    address:
      text(
        party.address
      )
  };
};

const normalizeCharge = (
  value
) => {
  const charge =
    record(value);
  const amount =
    record(
      charge.amount
    );

  return {
    id:
      nullableText(
        charge.id
      ),
    description:
      nullableText(
        charge.description
      ),
    chargeCategoryCode:
      nullableText(
        charge
          .chargeCategoryCode
      ),
    amount: {
      value:
        amount.value,
      currency:
        nullableText(
          amount.currency
        )
    },
    payingPartyRoleCode:
      nullableText(
        charge
          .payingPartyRoleCode
      ),
    transportPaymentMethodCode:
      nullableText(
        charge
          .transportPaymentMethodCode
      )
  };
};

const normalizeDraftInput = (
  input
) => {
  if (!isRecord(input)) {
    const error =
      new TypeError(
        "eCMR draft input must be an object"
      );
    error.code =
      "ECMR_DRAFT_INPUT_INVALID";
    throw error;
  }

  const goods =
    record(input.goods);
  const packages =
    record(goods.packages);
  const dangerousGoods =
    record(
      goods.dangerousGoods
    );
  const charges =
    record(input.charges);
  const customs =
    record(
      input.customsFormalities
    );
  const convention =
    record(
      input
        .conventionApplicability
    );

  return {
    parties: {
      sender:
        explicitParty(
          "sender",
          input.sender
        ),
      contractualCarrier:
        explicitParty(
          "contractual_carrier",
          input
            .contractualCarrier
        ),
      consignee:
        explicitParty(
          "consignee",
          input.consignee
        )
    },
    extension: {
      issue: {
        date:
          text(
            record(input.issue)
              .date
          ),
        place:
          text(
            record(input.issue)
              .place
          )
      },
      takingOver: {
        date:
          text(
            record(
              input.takingOver
            ).date
          ),
        place:
          text(
            record(
              input.takingOver
            ).place
          )
      },
      delivery: {
        place:
          text(
            record(
              input.delivery
            ).place
          )
      },
      goods: {
        packingMethod:
          text(
            goods
              .packingMethod
          ),
        packingMethodCode:
          nullableText(
            goods
              .packingMethodCode
          ),
        dangerousGoodsDescription:
          nullableText(
            goods
              .dangerousGoodsDescription
          ),
        dangerousGoods: {
          declared:
            dangerousGoods
              .declared === true,
          undgIdentificationCode:
            nullableText(
              dangerousGoods
                .undgIdentificationCode
            ),
          regulationCode:
            nullableText(
              dangerousGoods
                .regulationCode
            ),
          technicalName:
            nullableText(
              dangerousGoods
                .technicalName
            ),
          properShippingName:
            nullableText(
              dangerousGoods
                .properShippingName
            ),
          packagingDangerLevelCode:
            nullableText(
              dangerousGoods
                .packagingDangerLevelCode
            ),
          hazardClassificationId:
            nullableText(
              dangerousGoods
                .hazardClassificationId
            )
        },
        packages: {
          count:
            packages.count,
          marksAndNumbers:
            stringList(
              packages
                .marksAndNumbers
            )
        }
      },
      charges: {
        declared:
          charges.declared ===
          true,
        items:
          Array.isArray(
            charges.items
          )
            ? charges.items.map(
                normalizeCharge
              )
            : []
      },
      customsFormalities: {
        declared:
          customs.declared ===
          true,
        instructions:
          stringList(
            customs.instructions
          )
      },
      conventionApplicability: {
        declared:
          convention.declared ===
          true,
        statement:
          nullableText(
            convention.statement
          )
      }
    }
  };
};

const ECMR_PARTY_ROLES =
  new Set([
    "sender",
    "contractual_carrier",
    "consignee"
  ]);

export function buildEcmrDraftShipment({
  shipment,
  input
}) {
  const structural =
    validateShipmentAggregate(
      shipment
    );

  if (!structural.valid) {
    const error =
      new Error(
        "Base Shipment aggregate is invalid"
      );
    error.code =
      "ECMR_DRAFT_SHIPMENT_INVALID";
    error.validationErrors =
      structural.errors;
    throw error;
  }

  const normalized =
    normalizeDraftInput(
      input
    );
  const base =
    structuredClone(
      shipment
    );
  const existingParties =
    Array.isArray(
      base.parties
    )
      ? base.parties.filter(
          (party) =>
            !ECMR_PARTY_ROLES
              .has(
                party?.role
              )
        )
      : [];
  const existingContexts =
    Array.isArray(
      base.regulatoryContexts
    )
      ? base
          .regulatoryContexts
          .filter(
            (context) =>
              context?.type !==
              "ecmr"
          )
      : [];
  const extensions =
    record(
      base.extensions
    );

  base.parties = [
    ...existingParties,
    normalized.parties
      .sender,
    normalized.parties
      .contractualCarrier,
    normalized.parties
      .consignee
  ];
  base.regulatoryContexts = [
    ...existingContexts,
    {
      type: "ecmr",
      messageRelease:
        ECMR_UNCEFACT_RELEASE
    }
  ];
  base.extensions = {
    ...structuredClone(
      extensions
    ),
    ecmr:
      normalized.extension
  };

  return base;
}

export function prepareEcmrDraft({
  shipment,
  input
}) {
  const draftShipment =
    buildEcmrDraftShipment({
      shipment,
      input
    });
  const projection =
    ecmrProjectionFromShipment(
      draftShipment
    );
  const validation =
    validateEcmrProjection(
      projection
    );

  return {
    shipment:
      draftShipment,
    projection,
    validation
  };
}
