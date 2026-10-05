# DeCA fixture acceptance diagnostics

The protected `DeCA Kairoseth Cargo Acceptance Fixture` workflow may emit only sanitized failure diagnostics when the deployed Kairoseth fixture endpoint does not return HTTP 200.

Allowed diagnostic fields:

- curl exit status;
- HTTP response code;
- response `status` when it is a short alphanumeric token;
- response `check` when it is a short alphanumeric token.

The workflow must never print the protected raw response body, operations secret, PDF token, shipment ID, or public PDF URL on failure.

The diagnostic is intended to distinguish these operational classes without weakening the production secret boundary:

- HTTP `401`: the GitHub environment secret does not match the deployed Kairoseth operations secret;
- HTTP `503`: Kairoseth accepted the request boundary but the protected fixture operation could not complete, typically requiring bridge/runtime investigation;
- transport/edge status other than `200`: provider/CDN/WAF or connectivity investigation;
- HTTP `200` with a non-green sanitized contract: application-level fixture response validation failure.

No raw response body is retained or printed when classifying these failures.
