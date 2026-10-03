# Puente DeCA

Puente DeCA is an API-first transport compliance bridge for generating and managing Spain's electronic Documento de Control Administrativo (DeCA).

## Goals

- Keep the transport domain independent from any ERP, ecommerce or TMS.
- Accept normalized shipment data through a stable API contract.
- Validate DeCA-required fields before document generation.
- Generate native PDF documents with QR-backed HTTPS access.
- Preserve creation/modification history and audit evidence.
- Support multiple organizations and connectors.
- Make WooCommerce, PrestaShop, CSV/Excel and custom ERP integrations thin adapters over the same core.

## Architecture

```text
ERP / Ecommerce / TMS / CSV
            |
        Connectors
            |
       Puente DeCA API
            |
   Transport domain core
      /      |       \
Validation  Documents  Audit
              |
        PDF + QR + URL
```

Repository layout:

- `apps/api` — HTTP API.
- `packages/contracts` — stable input/output contracts.
- `packages/core` — transport/DeCA domain rules.
- `packages/document-engine` — PDF/QR/access-document pipeline.
- `packages/persistence` — tenant state, API credentials and document artifacts.
- `connectors/` — platform-specific adapters.
- `docs/` — architecture, legal/technical traceability and runbooks.
- `examples/` — sample payloads and imports.

## Operational flow

Authenticated clients use a tenant API key:

1. `POST /v1/shipments` creates a normalized shipment.
2. `POST /v1/shipments/:id/deca` generates, stores and versions its DeCA.
3. `GET /v1/deca/:id` returns document metadata.
4. `GET /v1/deca/:id.pdf` downloads it with API authentication.
5. The QR URL `/d/<token>.pdf` downloads the stored PDF directly without login for roadside inspection.

The public QR endpoint serves only the opaque token URL embedded in the generated PDF; tenant APIs remain authenticated and scope-controlled.

## Development

Requires Node 22.

```bash
npm run check
npm test
npm run server
```

Runtime state defaults to `./data` and can be changed with `DATA_DIR`. Set `PUBLIC_BASE_URL` to the externally reachable HTTPS base used by QR links.

## Development principle

The repository follows the same engineering principle as Puente VeriFactu: a small reusable core, thin connectors, deterministic tests and minimal CI.

## Status

Phases 0–2 are complete. Multi-tenant persistence is active and the operational API is being connected to it.
