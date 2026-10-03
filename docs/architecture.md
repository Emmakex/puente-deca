# Architecture

## Product boundary

Puente DeCA is not an ERP or TMS. It is a transport-compliance bridge.

Source systems remain responsible for commercial and operational data. Puente DeCA normalizes that data into a stable transport model, validates the DeCA requirements, produces compliant documents, preserves evidence and exposes the result back to the source system.

## Layers

1. **Connectors** — WooCommerce, PrestaShop, CSV/Excel, ERP/TMS or custom integrations.
2. **Contracts** — stable API payloads independent from source platforms.
3. **Core** — transport and DeCA rules.
4. **Document engine** — native PDF, QR and unique HTTPS access URL.
5. **Persistence/audit** — organizations, shipments, versions, immutable audit events and retention.
6. **API** — authentication, idempotency, generation, retrieval and document lifecycle.

## Domain model direction

The long-term root aggregate is `Shipment`, not `DecaDocument`.

A shipment may later produce multiple regulatory representations:

- Spain DeCA
- eCMR
- eFTI-compatible representations
- other transport documents

This prevents the platform from becoming coupled to a single regulation.

## Current vertical slice

The initial slice intentionally has no external runtime dependencies:

```text
POST /v1/deca/validate
          |
          v
  validateDecaRequest()
          |
          v
 { valid, errors[] }
```

This keeps the first CI lane deterministic and very fast while the document and persistence engines are introduced.
