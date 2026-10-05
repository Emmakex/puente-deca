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
- `X-Robots-Tag` containing `noindex`;
- CSP containing `default-src 'none'` and `frame-ancestors 'none'`;
- no `Set-Cookie`;
- no `X-Powered-By`;
- no internal `X-DeCA-Document-Id` or `X-DeCA-Version`;
- no internal `X-Kairoseth-*` response header.

Any forbidden public header fails with `PUBLIC_PDF_INTERNAL_HEADER_LEAK`.

## Why it does not create a document

A synthetic generated DeCA would itself enter the retention lifecycle. This smoke intentionally consumes an already-approved controlled document so the public-routing check does not create extra retained regulatory artifacts.

The command needs no service secret, MongoDB credential or Kairoseth user session.

## Acceptance boundary

Passing this script proves the public DeCA document response observed at the Kairoseth edge satisfies the documented integrity/privacy/header contract for the tested URL. It does **not** by itself close the Hostinger CDN/WAF production gate; that gate still requires a retained live run against the deployed production edge and the associated infrastructure evidence.
