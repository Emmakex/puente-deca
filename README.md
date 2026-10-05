# Puente DeCA

Puente DeCA is the transport-compliance engine behind **Kairoseth Cargo inside Kairoseth Platform (kairoseth.com)**. It provides an API-first bridge for generating and managing Spain's electronic Documento de Control Administrativo (DeCA).

It is deliberately **not a separate customer platform**. Customer authentication, organizations, product RBAC, billing/entitlements and workspace UX belong to Kairoseth Platform.

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
Kairoseth Platform / kairoseth.com
  |  customer auth + organization + product RBAC
  |
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

The agreed **DeCA product scope remains the only active completion priority**. Internal engineering and internal acceptance are substantially complete; the remaining work is the Kairoseth-controlled live acceptance/evidence layer for Atlas/GridFS, DR, deployed engine/public route, controlled connector stores, Hostinger edge/provider controls and the final evidence freeze.

**eCMR and eFTI are frozen and must not receive new development until DeCA reaches 100% under the acceptance ledger.** Existing Phase 7 work is preserved but is not an active completion track and does not count toward the DeCA percentage.

Sources of truth:

- [`docs/deca-100-percent-acceptance-ledger.md`](docs/deca-100-percent-acceptance-ledger.md) — exact gates required to declare DeCA 100%;
- [`docs/roadmap.md`](docs/roadmap.md) — full historical/global roadmap;
- [`docs/deca-first-completion-policy.md`](docs/deca-first-completion-policy.md) — DeCA-first scope rule.

## Kairoseth Platform boundary

Canonical production product identity:

```text
area        extensions
product     Kairoseth Cargo
slug        puente-deca
platform    Kairoseth Platform
```

The local organization/API-key store in this repository exists for deterministic development and service-contract testing. It is **not** the production source of truth for customer accounts or organization membership.

Production integration rules are documented in [`docs/kairoseth-platform-integration.md`](docs/kairoseth-platform-integration.md).
