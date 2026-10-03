const normalizeHeader = (value) =>
  String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim();

export function parseCsvRows(
  text,
  { delimiter = "," } = {}
) {
  if (
    typeof delimiter !== "string" ||
    delimiter.length !== 1
  ) {
    throw new TypeError(
      "delimiter must be one character"
    );
  }

  const input = String(text ?? "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }

    if (character === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (
      character === "\n" ||
      character === "\r"
    ) {
      if (
        character === "\r" &&
        input[index + 1] === "\n"
      ) {
        index += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  if (quoted) {
    const error = new Error(
      "CSV contains an unterminated quoted field"
    );
    error.code = "CSV_UNTERMINATED_QUOTE";
    throw error;
  }

  if (
    field.length > 0 ||
    row.length > 0
  ) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter(
    (values) =>
      values.some(
        (value) => String(value).trim() !== ""
      )
  );
}

export function parseCsvObjects(
  text,
  options = {}
) {
  const rows = parseCsvRows(text, options);

  if (rows.length === 0) return [];

  const headers =
    rows[0].map(normalizeHeader);

  if (
    headers.some(
      (header) => header.length === 0
    )
  ) {
    throw new Error(
      "CSV headers cannot be empty"
    );
  }

  if (
    new Set(headers).size !== headers.length
  ) {
    throw new Error(
      "CSV headers must be unique"
    );
  }

  return rows.slice(1).map(
    (values, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(
        headers.map(
          (header, column) => [
            header,
            values[column] ?? ""
          ]
        )
      )
    })
  );
}
