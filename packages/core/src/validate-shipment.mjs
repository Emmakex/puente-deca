import {
  SHIPMENT_CONTRACT_VERSION
} from "../../contracts/src/shipment.mjs";

const isRecord = (
  value
) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const hasText = (
  value
) =>
  typeof value === "string" &&
  value.trim().length > 0;

const issue = (
  path,
  code,
  message
) => ({
  path,
  code,
  message
});

export function validateShipmentAggregate(
  input
) {
  const errors = [];

  if (!isRecord(input)) {
    return {
      valid: false,
      errors: [
        issue(
          "$",
          "invalid_type",
          "Expected an object"
        )
      ]
    };
  }

  if (
    input.contractVersion !==
    SHIPMENT_CONTRACT_VERSION
  ) {
    errors.push(
      issue(
        "contractVersion",
        "unsupported_version",
        "Unsupported shipment contract version"
      )
    );
  }

  if (
    !hasText(
      input.externalReference
    )
  ) {
    errors.push(
      issue(
        "externalReference",
        "required",
        "External shipment reference is required"
      )
    );
  }

  if (
    !hasText(
      input.transportMode
    )
  ) {
    errors.push(
      issue(
        "transportMode",
        "required",
        "Transport mode is required"
      )
    );
  }

  if (
    !Array.isArray(
      input.parties
    )
  ) {
    errors.push(
      issue(
        "parties",
        "invalid_type",
        "Parties must be an array"
      )
    );
  } else {
    const roles = new Set();

    input.parties.forEach(
      (party, index) => {
        if (!isRecord(party)) {
          errors.push(
            issue(
              `parties.${index}`,
              "invalid_type",
              "Party must be an object"
            )
          );
          return;
        }

        if (!hasText(party.role)) {
          errors.push(
            issue(
              `parties.${index}.role`,
              "required",
              "Party role is required"
            )
          );
          return;
        }

        if (roles.has(party.role)) {
          errors.push(
            issue(
              `parties.${index}.role`,
              "duplicate",
              "Party roles must be unique"
            )
          );
          return;
        }

        roles.add(party.role);
      }
    );
  }

  for (
    const key of [
      "route",
      "cargo",
      "movement",
      "extensions"
    ]
  ) {
    if (!isRecord(input[key])) {
      errors.push(
        issue(
          key,
          "invalid_type",
          `${key} must be an object`
        )
      );
    }
  }

  if (
    !Array.isArray(
      input.regulatoryContexts
    )
  ) {
    errors.push(
      issue(
        "regulatoryContexts",
        "invalid_type",
        "regulatoryContexts must be an array"
      )
    );
  }

  return {
    valid:
      errors.length === 0,
    errors
  };
}
