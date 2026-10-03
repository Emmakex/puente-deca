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
- `connectors/` — platform-specific adapters.
- `docs/` — architecture, legal/technical traceability and runbooks.
- `examples/` — sample payloads and imports.

## Development principle

The repository follows the same engineering principle as Puente VeriFactu: a small reusable core, thin connectors, deterministic tests and minimal CI.

## Status

Initial foundation in progress.
