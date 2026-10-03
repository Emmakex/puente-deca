# CSV / Excel file import connector

This connector maps flat CSV and Excel `.xlsx` exports into the canonical Puente DeCA request contract.

It deliberately does not duplicate legal validation rules. Rows are mapped and then passed through the same normalization and validation core used by the API.

## Supported formats

- `.csv` with standard quoted fields, embedded commas and escaped quotes.
- `.xlsx` using the first worksheet.

Both formats use the same canonical column names and preserve row numbers in validation errors.

## Required columns

See `examples/file-import/shipments.csv` and `examples/file-import/shipments.xlsx` for templates.

Excel date cells are normalized to `YYYY-MM-DD` before passing through the DeCA validation core.

## CLI

```bash
npm run file-import:demo
npm run file-import:xlsx:demo
```

Or call the CLI directly with either format:

```bash
node connectors/file-import/src/cli.mjs path/to/shipments.csv
node connectors/file-import/src/cli.mjs path/to/shipments.xlsx
```

The CLI exits with code 1 when at least one row is invalid, which makes it suitable for controlled batch pipelines.
