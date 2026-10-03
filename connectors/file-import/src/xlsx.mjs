import {
  readSheet
} from "read-excel-file/node";
import {
  importObjectRows
} from "./import.mjs";

const normalizeHeader = (value) =>
  String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim();

const isEmptyCell = (value) =>
  value === null ||
  value === undefined ||
  String(value).trim() === "";

export function sheetRowsToObjects(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError(
      "XLSX sheet data must be an array"
    );
  }

  const nonEmptyRows = rows.filter(
    (row) =>
      Array.isArray(row) &&
      row.some(
        (value) => !isEmptyCell(value)
      )
  );

  if (nonEmptyRows.length === 0) {
    return [];
  }

  const headers =
    nonEmptyRows[0].map(normalizeHeader);

  if (
    headers.some(
      (header) => header.length === 0
    )
  ) {
    throw new Error(
      "XLSX headers cannot be empty"
    );
  }

  if (
    new Set(headers).size !== headers.length
  ) {
    throw new Error(
      "XLSX headers must be unique"
    );
  }

  return nonEmptyRows
    .slice(1)
    .map((values, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(
        headers.map(
          (header, column) => [
            header,
            values[column] ?? ""
          ]
        )
      )
    }));
}

export async function importXlsx(
  input
) {
  const rows = await readSheet(input);

  return importObjectRows(
    sheetRowsToObjects(rows)
  );
}
