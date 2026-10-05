# DeCA fixture acceptance diagnostics

The protected `DeCA Kairoseth Cargo Acceptance Fixture` workflow may emit only sanitized failure diagnostics when the deployed Kairoseth fixture endpoint does not return HTTP 200.

Allowed diagnostic fields:

- curl exit status;
- HTTP response code;
- response `status` when it is a short alphanumeric token;
- response `check` when it is a short alphanumeric token.

The workflow must never print the protected raw response body, operations secret, PDF token, shipment ID, or public PDF URL on failure.

This diagnostic exists only to distinguish authentication mismatch, internal bridge unavailability and edge/provider failures without weakening the production secret boundary.
