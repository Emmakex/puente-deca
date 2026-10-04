import {
  ECMR_CONTRACT_VERSION,
  ECMR_UNCEFACT_RELEASE
} from "../../contracts/src/ecmr.mjs";

const hasText = (
  value
) =>
  typeof value === "string" &&
  value.trim().length > 0;

const isoDate = (
  value
) => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value ?? ""
    )
  ) {
    return false;
  }

  const parsed =
    new Date(
      `${value}T00:00:00Z`
    );

  return (
    !Number.isNaN(
      parsed.getTime()
    ) &&
    parsed
      .toISOString()
      .slice(0, 10) ===
      value
  );
};

const error = (
  path,
  code,
  message,
  legalBasis
) => ({
  path,
  code,
  message,
  legalBasis
});

const requiredText = (
  errors,
  path,
  value,
  legalBasis
) => {
  if (!hasText(value)) {
    errors.push(
      error(
        path,
        "required",
        "Required eCMR particular",
        legalBasis
      )
    );
  }
};

export function validateEcmrProjection(
  input
) {
  const errors = [];

  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    return {
      valid: false,
      errors: [
        error(
          "$",
          "invalid_type",
          "Expected an eCMR projection object",
          null
        )
      ]
    };
  }

  if (
    input.contractVersion !==
    ECMR_CONTRACT_VERSION
  ) {
    errors.push(
      error(
        "contractVersion",
        "unsupported_version",
        "Unsupported internal eCMR contract version",
        null
      )
    );
  }

  if (
    input.messageRelease !==
    ECMR_UNCEFACT_RELEASE
  ) {
    errors.push(
      error(
        "messageRelease",
        "unsupported_release",
        "Unsupported UN/CEFACT eCMR release",
        null
      )
    );
  }

  if (
    !isoDate(
      input.issue?.date
    )
  ) {
    errors.push(
      error(
        "issue.date",
        "invalid_date",
        "Issue date must use YYYY-MM-DD",
        "CMR_6_1_A"
      )
    );
  }
  requiredText(
    errors,
    "issue.place",
    input.issue?.place,
    "CMR_6_1_A"
  );

  for (
    const [
      key,
      basis
    ] of [
      [
        "sender",
        "CMR_6_1_B"
      ],
      [
        "contractualCarrier",
        "CMR_6_1_C"
      ],
      [
        "consignee",
        "CMR_6_1_E"
      ]
    ]
  ) {
    requiredText(
      errors,
      `${key}.legalName`,
      input[key]?.legalName,
      basis
    );
    requiredText(
      errors,
      `${key}.address`,
      input[key]?.address,
      basis
    );
  }

  requiredText(
    errors,
    "takingOver.place",
    input.takingOver?.place,
    "CMR_6_1_D"
  );
  if (
    !isoDate(
      input.takingOver?.date
    )
  ) {
    errors.push(
      error(
        "takingOver.date",
        "invalid_date",
        "Taking-over date must use YYYY-MM-DD",
        "CMR_6_1_D"
      )
    );
  }
  requiredText(
    errors,
    "delivery.place",
    input.delivery?.place,
    "CMR_6_1_D"
  );

  requiredText(
    errors,
    "goods.nature",
    input.goods?.nature,
    "CMR_6_1_F"
  );
  requiredText(
    errors,
    "goods.packingMethod",
    input.goods
      ?.packingMethod,
    "CMR_6_1_F"
  );

  if (
    !Number.isInteger(
      input.goods
        ?.packages?.count
    ) ||
    input.goods
      .packages.count < 0
  ) {
    errors.push(
      error(
        "goods.packages.count",
        "invalid_count",
        "Package count must be a non-negative integer",
        "CMR_6_1_G"
      )
    );
  }

  if (
    !Array.isArray(
      input.goods
        ?.packages
        ?.marksAndNumbers
    )
  ) {
    errors.push(
      error(
        "goods.packages.marksAndNumbers",
        "invalid_type",
        "Package marks and numbers must be an array",
        "CMR_6_1_G"
      )
    );
  }

  const quantity =
    input.goods?.quantity;

  if (
    !quantity ||
    !Number.isFinite(
      quantity.value
    ) ||
    quantity.value <= 0 ||
    !hasText(
      quantity.unit
    )
  ) {
    errors.push(
      error(
        "goods.quantity",
        "required",
        "Positive gross weight or another expressed quantity is required",
        "CMR_6_1_H"
      )
    );
  }

  if (
    input.charges?.declared !==
    true ||
    !Array.isArray(
      input.charges?.items
    )
  ) {
    errors.push(
      error(
        "charges",
        "declaration_required",
        "Carriage charges must be explicitly declared, including an empty item list when none apply",
        "CMR_6_1_I"
      )
    );
  }

  if (
    Array.isArray(
      input.charges?.items
    )
  ) {
    input.charges.items.forEach(
      (charge, index) => {
        if (
          charge === null ||
          typeof charge !==
            "object" ||
          Array.isArray(charge)
        ) {
          errors.push(
            error(
              `charges.items.${index}`,
              "invalid_type",
              "Charge item must be an object",
              "CMR_6_1_I"
            )
          );
          return;
        }

        const hasIdentity =
          hasText(charge.id) ||
          hasText(
            charge.description
          ) ||
          hasText(
            charge
              .chargeCategoryCode
          );

        if (!hasIdentity) {
          errors.push(
            error(
              `charges.items.${index}`,
              "identification_required",
              "Charge item needs an ID, description or explicit category code",
              "CMR_6_1_I"
            )
          );
        }

        if (
          !Number.isFinite(
            charge.amount?.value
          ) ||
          charge.amount.value < 0 ||
          !/^[A-Z]{3}$/.test(
            charge.amount
              ?.currency ?? ""
          )
        ) {
          errors.push(
            error(
              `charges.items.${index}.amount`,
              "invalid_amount",
              "Charge amount needs a non-negative value and a three-letter uppercase currency code",
              "CMR_6_1_I"
            )
          );
        }

        for (
          const key of [
            "payingPartyRoleCode",
            "transportPaymentMethodCode"
          ]
        ) {
          if (
            charge[key] !== null &&
            charge[key] !==
              undefined &&
            !hasText(charge[key])
          ) {
            errors.push(
              error(
                `charges.items.${index}.${key}`,
                "invalid_code",
                "Optional charge codes must be non-empty when supplied",
                "CMR_6_1_I"
              )
            );
          }
        }
      }
    );
  }

  if (
    input.customsFormalities
      ?.declared !== true ||
    !Array.isArray(
      input.customsFormalities
        ?.instructions
    )
  ) {
    errors.push(
      error(
        "customsFormalities",
        "declaration_required",
        "Customs/formality instructions must be explicitly declared, including an empty list when none apply",
        "CMR_6_1_J"
      )
    );
  }

  if (
    input
      .conventionApplicability
      ?.convention !==
      "CMR" ||
    input
      .conventionApplicability
      ?.declared !== true
  ) {
    errors.push(
      error(
        "conventionApplicability",
        "declaration_required",
        "CMR applicability statement must be declared",
        "CMR_6_1_K"
      )
    );
  }

  return {
    valid:
      errors.length === 0,
    errors
  };
}

export function validateEcmrElectronicReadiness(
  input
) {
  const particulars =
    validateEcmrProjection(
      input
    );
  const errors = [
    ...particulars.errors
  ];

  if (
    input
      ?.authentication
      ?.state !==
      "authenticated" ||
    !hasText(
      input
        ?.authentication
        ?.method
    ) ||
    !Array.isArray(
      input
        ?.authentication
        ?.signatures
    ) ||
    input.authentication
      .signatures.length < 1
  ) {
    errors.push(
      error(
        "authentication",
        "authentication_required",
        "Electronic consignment note authentication is not complete",
        "ECMR_PROTOCOL_ARTICLE_3"
      )
    );
  }

  if (
    input
      ?.integrity
      ?.state !==
      "final" ||
    !hasText(
      input
        ?.integrity
        ?.contentHash
    ) ||
    input
      ?.integrity
      ?.amendmentHistoryPreserved !==
      true
  ) {
    errors.push(
      error(
        "integrity",
        "integrity_required",
        "Electronic consignment note integrity/amendment evidence is not complete",
        "ECMR_PROTOCOL_ARTICLE_4"
      )
    );
  }

  return {
    valid:
      errors.length === 0,
    errors
  };
}
