import {
  ECMR_D25A_PROFILE
} from "./d25a-profile.mjs";
import {
  validateEcmrProjection
} from "../../core/src/validate-ecmr.mjs";

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const text = (value) =>
  typeof value === "string"
    ? value.trim()
    : "";

const date102 = (value) =>
  text(value).replaceAll("-", "");

const element = (
  name,
  value,
  {
    prefix = "ram",
    attributes = {}
  } = {}
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  const attributeText =
    Object.entries(attributes)
      .filter(
        ([, entry]) =>
          entry !== null &&
          entry !== undefined &&
          entry !== ""
      )
      .map(
        ([key, entry]) =>
          ` ${key}="${escapeXml(entry)}"`
      )
      .join("");

  return `<${prefix}:${name}${attributeText}>${escapeXml(
    value
  )}</${prefix}:${name}>`;
};

const container = (
  name,
  children,
  prefix = "ram"
) => {
  const body =
    children
      .filter(Boolean)
      .join("");

  return body
    ? `<${prefix}:${name}>${body}</${prefix}:${name}>`
    : "";
};

const party = (
  nodeName,
  value
) =>
  container(
    nodeName,
    [
      element(
        "Name",
        text(value?.legalName)
      ),
      container(
        "PostalTradeAddress",
        [
          element(
            "LineOne",
            text(value?.address)
          )
        ]
      )
    ]
  );

const dateTime102 = (
  value
) =>
  container(
    "ActualOccurrenceDateTime",
    [
      element(
        "DateTimeString",
        date102(value),
        {
          prefix: "udt",
          attributes: {
            format: "102"
          }
        }
      )
    ]
  );

const shippingMarks = (
  marks
) =>
  Array.isArray(marks)
    ? marks
        .map(text)
        .filter(Boolean)
        .map(
          (mark) =>
            container(
              "PhysicalLogisticsShippingMarks",
              [
                element(
                  "Marking",
                  mark
                )
              ]
            )
        )
    : [];

const borderClearanceInstructions = (
  customsFormalities
) =>
  Array.isArray(
    customsFormalities
      ?.instructions
  )
    ? customsFormalities
        .instructions
        .map(text)
        .filter(Boolean)
        .map(
          (instruction) =>
            container(
              "ConsignorProvidedBorderClearanceTransportInstructions",
              [
                element(
                  "Description",
                  instruction
                )
              ]
            )
        )
    : [];

const cmrContractualClause = (
  conventionApplicability
) =>
  conventionApplicability
    ?.declared === true &&
  text(
    conventionApplicability
      ?.statement
  )
    ? container(
        "ContractualDocumentClause",
        [
          element(
            "Content",
            text(
              conventionApplicability
                .statement
            )
          )
        ]
      )
    : "";

const serviceCharge = (
  charge
) =>
  container(
    "ApplicableLogisticsServiceCharge",
    [
      element(
        "ID",
        text(charge?.id)
      ),
      element(
        "Description",
        text(
          charge?.description
        )
      ),
      element(
        "ChargeCategoryCode",
        text(
          charge
            ?.chargeCategoryCode
        )
      ),
      element(
        "AppliedAmount",
        charge?.amount?.value,
        {
          attributes: {
            currencyID:
              text(
                charge?.amount
                  ?.currency
              )
          }
        }
      ),
      element(
        "PayingPartyRoleCode",
        text(
          charge
            ?.payingPartyRoleCode
        )
      ),
      element(
        "TransportPaymentMethodCode",
        text(
          charge
            ?.transportPaymentMethodCode
        )
      )
    ]
  );

const serviceCharges = (
  charges
) =>
  Array.isArray(charges?.items)
    ? charges.items.map(
        serviceCharge
      )
    : [];

const dangerousGoods = (
  goods
) => {
  const value =
    goods?.dangerousGoods;

  if (
    value?.declared !==
    true
  ) {
    return "";
  }

  return container(
    "ApplicableTransportDangerousGoods",
    [
      element(
        "SequenceNumeric",
        1
      ),
      element(
        "UNDGIdentificationCode",
        text(
          value
            .undgIdentificationCode
        )
      ),
      element(
        "RegulationCode",
        text(
          value.regulationCode
        )
      ),
      element(
        "TechnicalName",
        text(
          value.technicalName
        )
      ),
      element(
        "ProperShippingName",
        text(
          value
            .properShippingName
        )
      ),
      element(
        "PackagingDangerLevelCode",
        text(
          value
            .packagingDangerLevelCode
        )
      ),
      element(
        "HazardClassificationID",
        text(
          value
            .hazardClassificationId
        )
      )
    ]
  );
};

const consignmentItem = (
  goods
) => {
  const count =
    goods?.packages?.count;
  const marks =
    goods?.packages
      ?.marksAndNumbers;

  return container(
    "IncludedSupplyChainConsignmentItem",
    [
      element(
        "SequenceNumeric",
        1
      ),
      container(
        "NatureIdentificationTransportCargo",
        [
          element(
            "Identification",
            text(goods?.nature)
          )
        ]
      ),
      dangerousGoods(
        goods
      ),
      container(
        "TransportLogisticsPackage",
        [
          element(
            "ItemQuantity",
            Number.isInteger(count)
              ? count
              : null
          ),
          element(
            "TypeCode",
            text(
              goods
                ?.packingMethodCode
            )
          ),
          element(
            "TypeText",
            text(
              goods
                ?.packingMethod
            )
          ),
          ...shippingMarks(
            marks
          )
        ]
      )
    ]
  );
};

const quantityMeasure = (
  quantity
) => {
  if (
    !quantity ||
    !Number.isFinite(
      quantity.value
    ) ||
    !text(quantity.unit)
  ) {
    return "";
  }

  if (
    quantity.kind !== "weight"
  ) {
    return "";
  }

  const unit =
    text(quantity.unit)
      .toLowerCase() === "kg"
      ? "KGM"
      : text(quantity.unit);

  return element(
    "GrossWeightMeasure",
    quantity.value,
    {
      attributes: {
        unitCode: unit
      }
    }
  );
};

export function serializeEcmrD25aEnvelope(
  projection
) {
  const validation =
    validateEcmrProjection(
      projection
    );

  if (!validation.valid) {
    const error = new Error(
      "eCMR projection is not complete enough to serialize"
    );
    error.code =
      "ECMR_D25A_PROJECTION_INVALID";
    error.validationErrors =
      validation.errors;
    throw error;
  }

  const {
    namespaces
  } = ECMR_D25A_PROFILE;

  const exchangedDocumentContext =
    container(
      "ExchangedDocumentContext",
      [],
      "rsm"
    );

  const exchangedDocument =
    container(
      "ExchangedDocument",
      [
        element(
          "ID",
          projection.externalReference
        ),
        container(
          "IssueDateTime",
          [
            element(
              "DateTimeString",
              date102(
                projection.issue.date
              ),
              {
                prefix: "udt",
                attributes: {
                  format: "102"
                }
              }
            )
          ]
        ),
        container(
          "IssueLogisticsLocation",
          [
            element(
              "Name",
              projection.issue.place
            )
          ]
        ),
        cmrContractualClause(
          projection
            .conventionApplicability
        )
      ],
      "rsm"
    );

  const consignment =
    container(
      "SpecifiedSupplyChainConsignment",
      [
        quantityMeasure(
          projection.goods.quantity
        ),
        element(
          "ConsignmentItemQuantity",
          projection.goods
            ?.packages?.count
        ),
        party(
          "ConsignorTradeParty",
          projection.sender
        ),
        party(
          "ConsigneeTradeParty",
          projection.consignee
        ),
        party(
          "CarrierTradeParty",
          projection
            .contractualCarrier
        ),
        container(
          "CarrierAcceptanceLogisticsLocation",
          [
            element(
              "Name",
              projection
                .takingOver
                .place
            )
          ]
        ),
        container(
          "PickUpTransportEvent",
          [
            dateTime102(
              projection
                .takingOver
                .date
            )
          ]
        ),
        container(
          "ConsigneeReceiptLogisticsLocation",
          [
            element(
              "Name",
              projection
                .delivery
                .place
            )
          ]
        ),
        consignmentItem(
          projection.goods
        ),
        ...serviceCharges(
          projection.charges
        ),
        ...borderClearanceInstructions(
          projection
            .customsFormalities
        )
      ],
      "rsm"
    );

  const xml =
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<rsm:eCMR xmlns:rsm="${namespaces.rsm}" xmlns:ram="${namespaces.ram}" xmlns:qdt="${namespaces.qdt}" xmlns:udt="${namespaces.udt}">`,
      exchangedDocumentContext,
      exchangedDocument,
      consignment,
      "</rsm:eCMR>"
    ].join("");

  return {
    release:
      ECMR_D25A_PROFILE.release,
    rootSchema:
      ECMR_D25A_PROFILE.rootSchema,
    schemaConformance:
      "pending-official-xsd-validation",
    xml,
    mappedProjectionPaths: [
      "externalReference",
      "issue.date",
      "issue.place",
      "sender",
      "contractualCarrier",
      "takingOver.place",
      "takingOver.date",
      "delivery.place",
      "consignee",
      "goods.quantity",
      "goods.nature",
      "goods.packingMethod",
      "goods.packingMethodCode",
      "goods.dangerousGoods",
      "goods.packages.count",
      "goods.packages.marksAndNumbers",
      "charges",
      "customsFormalities",
      "conventionApplicability"
    ],
    pendingProjectionPaths: [
      "goods.dangerousGoodsDescription",
      "authentication",
      "integrity"
    ]
  };
}
