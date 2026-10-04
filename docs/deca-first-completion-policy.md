# DeCA-first completion policy

## Decision

Current development priority is **DeCA only** until Kairoseth Cargo / Puente DeCA reaches 100% completion and production acceptance for the agreed DeCA product scope.

The implementation order is fixed as:

1. **DeCA — finish to 100%.**
2. **eCMR — resume only after DeCA is complete.**
3. **eFTI — start only after the eCMR phase is complete or when a DeCA production requirement makes a narrowly scoped eFTI interoperability change necessary.**

This sequencing is a product-development rule, not merely a roadmap preference.

## Scope boundary while DeCA is active

Until DeCA reaches 100%, new product development must stay inside the DeCA scope:

- canonical DeCA contract and validation;
- DeCA PDF/document generation and QR access;
- immutable document versions, retention and audit;
- Kairoseth Platform integration and tenant isolation;
- WooCommerce integration;
- PrestaShop integration;
- ERP/CRM/custom-software integration through the API/connector contract;
- CSV/Excel import;
- MongoDB/GridFS production persistence within the existing Kairoseth infrastructure;
- Hostinger/Kairoseth production routing, hardening, observability and acceptance;
- production smoke tests, backup/restore, security and go-live evidence.

Do **not** add new eCMR or eFTI product functionality while any DeCA completion gate remains open.

## eCMR status

The eCMR work already implemented is preserved in the repository as a **frozen future module**. It is not part of the current DeCA completion target and must not block DeCA release.

Existing eCMR code, tests and documentation remain maintained by normal CI so that completed work is not lost. However:

- no new eCMR feature slices are started;
- no production eCMR issuance is enabled;
- no additional legal/signing/provider integration is developed;
- no eCMR live-acceptance work takes priority over a DeCA gate.

When DeCA is complete, eCMR resumes from its documented current state instead of being redesigned from zero.

## eFTI status

eFTI is explicitly **deferred until after eCMR**.

The only exception before then is a minimal interoperability change that is strictly required for DeCA compliance or production operation. Such a change must not expand into an eFTI product implementation.

## Definition of “DeCA 100%”

DeCA is considered complete only when both conditions are true:

### 1. Internal product engineering is complete

The repository already has the agreed DeCA product capabilities implemented and protected by CI: contract/validation, document engine, API, persistence, connector packages, Kairoseth integration, production hardening and automated acceptance tooling.

### 2. All remaining DeCA production gates are closed with evidence

Current closure gates are the unchecked DeCA items in `docs/roadmap.md`, principally:

- live MongoDB Atlas transaction/index/concurrency acceptance;
- live Kairoseth public DeCA route acceptance;
- WooCommerce live-store smoke;
- PrestaShop 1.7.8.x and 8.x live compatibility smoke;
- live GridFS lifecycle/reconciliation acceptance;
- staging/DR Atlas backup/restore drill;
- Hostinger CDN/WAF edge protection acceptance;
- live internal-service deployment acceptance;
- live infrastructure security review;
- focused external penetration test.

A gate is not closed merely because automation exists. It closes when the intended production/staging environment has executed the acceptance and the evidence is retained.

## Development rule

Every future status/continuation decision for this repository must ask, in this order:

1. Is there an open DeCA product or production-acceptance gate?
2. Can it be advanced now with the existing Kairoseth/Hostinger/MongoDB infrastructure?
3. If yes, advance it before touching eCMR or eFTI.
4. If it requires an external credential/environment/provider not currently available, record it as a live gate and move to the next DeCA gate that can be advanced.

## Product architecture after DeCA completion

The future architecture can still reuse the regulation-neutral Shipment core:

```text
Kairoseth Cargo / Transport Compliance Engine
              |
        generic Shipment
          /        \
       DeCA        eCMR
                    |
                   eFTI
```

This shared architecture does **not** change the development order. DeCA is the current product being completed; eCMR and eFTI are subsequent phases.
