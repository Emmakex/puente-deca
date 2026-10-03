import {
  normalizeDecaRequest
} from "../../../packages/core/src/normalize-deca.mjs";
import {
  validateDecaRequest
} from "../../../packages/core/src/validate-deca.mjs";
import {
  parseCsvObjects
} from "./csv.mjs";

const textOrNull = (value) => {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
};

const positiveNumberOrNull = (value) => {
  const text = textOrNull(value);
  if (text === null) return null;

  const normalized = text.replace(",", ".");
  const number = Number(normalized);

  return Number.isFinite(number) &&
    number > 0
    ? number
    : Number.NaN;
};

export function rowToDecaRequest(row) {
  const weightValue =
    positiveNumberOrNull(
      row.weight_value
    );
  const alternativeValue =
    positiveNumberOrNull(
      row.alternative_measure_value
    );

  const goods = {
    nature: textOrNull(
      row.goods_nature
    ) ?? ""
  };

  if (weightValue !== null) {
    goods.weight = {
      value: weightValue,
      unit:
        textOrNull(row.weight_unit) ??
        "kg"
    };
  }

  if (alternativeValue !== null) {
    goods.alternativeMeasure = {
      value: alternativeValue,
      unit:
        textOrNull(
          row.alternative_measure_unit
        ) ?? ""
    };
  }

  return {
    externalReference:
      textOrNull(
        row.external_reference
      ) ?? "",
    contractualShipper: {
      legalName:
        textOrNull(row.shipper_name) ??
        "",
      taxId:
        textOrNull(row.shipper_tax_id) ??
        "",
      address:
        textOrNull(
          row.shipper_address
        ) ?? ""
    },
    effectiveCarrier: {
      legalName:
        textOrNull(row.carrier_name) ??
        "",
      taxId:
        textOrNull(row.carrier_tax_id) ??
        ""
    },
    route: {
      origin:
        textOrNull(row.origin) ?? "",
      destination:
        textOrNull(row.destination) ??
        ""
    },
    goods,
    transport: {
      date:
        textOrNull(
          row.transport_date
        ) ?? "",
      vehicle: {
        tractorRegistration:
          textOrNull(
            row.tractor_registration
          ) ?? "",
        trailerRegistration:
          textOrNull(
            row.trailer_registration
          )
      },
      specialTrafficAuthorization:
        textOrNull(
          row.special_traffic_authorization
        )
    },
    observations:
      textOrNull(row.observations)
  };
}

export function importCsvText(
  text,
  options = {}
) {
  const rows = parseCsvObjects(
    text,
    options
  );

  const records = rows.map(
    ({ rowNumber, values }) => {
      const request =
        normalizeDecaRequest(
          rowToDecaRequest(values)
        );
      const validation =
        validateDecaRequest(request);

      if (
        typeof request.externalReference !==
          "string" ||
        request.externalReference.length === 0
      ) {
        validation.valid = false;
        validation.errors.push({
          path: "externalReference",
          code: "required",
          message:
            "External shipment reference is required",
          responsibleParty:
            "contractualShipper"
        });
      }

      return {
        rowNumber,
        valid: validation.valid,
        request,
        errors: validation.errors
      };
    }
  );

  return {
    total: records.length,
    valid: records.filter(
      (record) => record.valid
    ).length,
    invalid: records.filter(
      (record) => !record.valid
    ).length,
    records
  };
}
