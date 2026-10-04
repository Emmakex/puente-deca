# Authorized eCMR amendment API

The immutable eCMR ledger is exposed through:

```text
GET  /v1/shipments/{shipmentId}/ecmr/versions
POST /v1/shipments/{shipmentId}/ecmr/versions
```

This API manages version history only. It does not by itself claim D25A XSD conformance, legal authentication or production issuance.

## Authorization

The endpoints use the existing organization-scoped Kairoseth/Puente DeCA authentication boundary:

- `regulatory:read` for history reads;
- `regulatory:write` for appends.

Kairoseth server-to-server context receives these scopes so the product workspace can call the engine without a second user/tenant system.

WooCommerce and PrestaShop connector credentials keep their existing default four scopes and do not receive regulatory access unless explicitly provisioned.

## Actor identity

The request cannot choose its own `actorId` or identity scheme.

The engine derives the actor from the authenticated subject:

```text
Kairoseth platform service:
  actorId        = kairoseth-platform:<organizationId>
  identityScheme = kairoseth-platform-service

API credential:
  actorId        = credential:<credentialId>
  identityScheme = kairoseth-api-credential
```

The caller supplies only the CMR `partyRole` and amendment `reason`.

A future Kairoseth workspace identity policy may add an authenticated human subject to this evidence. Until then, a platform-service append identifies the authorized organization service context, not an individual natural person.

## Exact XML

The `xml` field is preserved exactly as submitted.

Leading/trailing whitespace and line breaks are not trimmed before:

- persistence;
- SHA-256 content hashing;
- amendment-chain hashing;
- detached-signature hashing.

Therefore a whitespace-only byte change is detectable.

The HTTP JSON body is limited to an eCMR XML string of at most 950,000 characters; the broader request-size ceiling still applies at the server boundary.

## Optimistic head control

Every POST requires:

```json
{
  "expectedPreviousVersionId": null
}
```

for version 1, or the exact current head `versionId` for later versions.

If the client is stale, the engine returns:

```text
409 ecmr_stale_head
```

with the current version/head identifier.

This is the first concurrency barrier. MongoDB additionally verifies the accepted head inside a transaction and enforces a unique organization + Shipment + regulatory type + version index, so simultaneous writers cannot create two accepted version-2 records.

## Append request

```json
{
  "xml": "<rsm:eCMR>...</rsm:eCMR>",
  "reason": "Correct consignee address",
  "partyRole": "sender",
  "expectedPreviousVersionId": "ecmrv_..."
}
```

The server supplies `createdAt`. If the server clock does not advance past the latest stored version, the append timestamp is moved forward by one millisecond to preserve strict chronological ordering.

## Read behavior

GET returns the complete preserved version records plus a compact current-head summary.

Before returning a non-empty history, the engine executes `verifyEcmrAmendmentChain()`.

If persisted XML/hash/linkage evidence no longer verifies, the endpoint fails closed with:

```text
500 ecmr_history_integrity_failure
```

instead of returning a corrupted history as valid.

## Conflict behavior

POST returns 409 for:

- stale expected head;
- no-op XML;
- a concurrently changed regulatory head;
- an already-invalid amendment chain;
- non-monotonic lifecycle conflict.

Invalid request shapes return 422.

## Remaining workspace boundary

The API authorization layer is implemented. The Kairoseth workspace still needs a product UX/policy that determines which authenticated human users may request an eCMR amendment and, when needed, passes/records a stronger human identity assertion.

That work belongs in Kairoseth Platform rather than creating a second account or RBAC system inside Puente DeCA.
