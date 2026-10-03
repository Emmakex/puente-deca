# CSV file import connector

This connector maps a flat CSV export into the canonical Puente DeCA request contract.

It deliberately does not duplicate legal validation rules. Rows are mapped and then passed through the same normalization and validation core used by the API.

## Required columns

See `examples/file-import/shipments.csv` for the canonical template.

The importer supports standard quoted CSV fields, embedded commas and escaped quotes. Invalid rows are retained in the result with their original row number and field-level validation errors.

## CLI

```bash
npm run file-import:demo
```

The CLI exits with code 1 when at least one row is invalid, which makes it suitable for controlled batch pipelines.
