# Kairoseth ↔ Puente DeCA E2E contract

The repository includes a local end-to-end contract test that exercises the same trust boundary used by Kairoseth Platform without requiring production credentials.

Run:

```bash
npm run contract:kairoseth
```

## Covered flow

```text
Kairoseth organization A
  -> server-to-server auth
  -> create shipment
  -> generate DeCA
  -> persist immutable document metadata + PDF artifact
  -> produce https://kairoseth.com/deca/d/<token>.pdf
  -> fetch PDF through the public token path with no customer auth
  -> verify PDF SHA-256 against immutable artifact metadata
```

The same test then uses organization B and proves:

- organization B cannot fetch organization A's shipment;
- organization B cannot fetch organization A's DeCA metadata;
- organization B's shipment list is empty.

## Additional invariants

The contract test verifies:

- engine readiness before the workflow;
- canonical Kairoseth public URL shape;
- Unicode PDF generation;
- direct `application/pdf` response;
- `no-store`, `nosniff` and `no-referrer` headers;
- generated PDF checksum matches persisted immutable metadata;
- repeated document generation reuses the current immutable document when shipment content has not changed.

## Boundary

This test proves the application contract and tenant behavior in-process.

It does **not** replace the live production acceptance gates:

- MongoDB Atlas/GridFS;
- Hostinger/internal service routing;
- public `kairoseth.com` proxy;
- TLS/edge limits;
- real WooCommerce/PrestaShop stores;
- backup/restore;
- external penetration test.
