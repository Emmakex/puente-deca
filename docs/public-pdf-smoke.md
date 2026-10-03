# Public DeCA PDF live smoke

The public QR route can be validated without creating any new DeCA record.

Use an already-generated controlled DeCA document and its immutable SHA-256 metadata:

```bash
DECA_SMOKE_PUBLIC_URL='https://kairoseth.com/deca/d/<opaque-token>.pdf' \
DECA_SMOKE_EXPECTED_SHA256='sha256:<64 hex chars>' \
npm run production:public-pdf-smoke
```

## Checks

The command requires:

- HTTPS;
- host exactly `kairoseth.com`;
- path exactly `/deca/d/<opaque-token>.pdf`;
- no query string or fragment;
- no HTTP redirect;
- HTTP 2xx;
- `application/pdf`;
- maximum 5,000,000 bytes;
- `%PDF-` file signature;
- SHA-256 equality with immutable document metadata;
- `Cache-Control: no-store`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- `X-Robots-Tag` containing `noindex`.

## Why it does not create a document

A synthetic generated DeCA would itself enter the retention lifecycle. This smoke intentionally consumes an already-approved controlled document so the public-routing check does not create extra retained regulatory artifacts.

The command needs no service secret, MongoDB credential or Kairoseth user session.
