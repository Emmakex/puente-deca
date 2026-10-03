# Kairoseth Platform integration

Status: **canonical architecture boundary**  
Established: **3 October 2026**

## Decision

Puente DeCA lives in **Kairoseth Platform / kairoseth.com**.

This repository remains independently deployable because the compliance engine, connectors and release cadence benefit from isolation, but customers do not receive a separate Puente DeCA account or separate tenant administration UI.

## Canonical identity

```text
Kairoseth area       extensions
Kairoseth product    Puente DeCA
product slug         puente-deca
engine repository    Emmakex/puente-deca
customer platform    Emmakex/kairoseth-platform
```

## Source of truth

### Kairoseth Platform owns

- human authentication/session;
- organization lifecycle and membership;
- product activation;
- Product Owner/Admin/Member authorization;
- customer workspace;
- billing and entitlements;
- connector credential management UX;
- platform support/audit context.

### Puente DeCA owns

- normalized transport/shipment contract;
- DeCA legal validation;
- PDF/QR generation;
- direct document URL;
- immutable versions;
- artifact integrity and retention metadata;
- connector-facing transport API;
- WooCommerce, PrestaShop, CSV/XLSX and ERP adapter contracts.

## Production tenant rule

Every production shipment/document belongs to a canonical Kairoseth `organizationId`.

The local `JsonStore.createOrganization()` facility remains useful for unit/integration tests and standalone service development. Production customer provisioning must not depend on it.

## Human versus machine authorization

Human access:

```text
Kairoseth session
+ organizationId
+ productSlug = puente-deca
→ product RBAC
```

Connector access:

```text
organization-scoped machine credential
→ Puente DeCA service scopes
```

A connector key cannot grant browser/session authority. A browser session cannot be converted into an engine credential on the client.

## Target service flow

```text
WooCommerce / PrestaShop / ERP
          |
          | scoped machine credential
          v
      Puente DeCA service
          |
          +-- create/update shipment
          +-- generate/revise DeCA
          +-- retain document versions
          |
          v
Kairoseth workspace reads/manages the same organization-scoped resources
```

## Public QR route

Target after reverse-proxy acceptance:

```text
https://kairoseth.com/deca/d/<opaque-token>.pdf
```

The QR request remains unauthenticated-by-session and direct-download-by-token as required by the DeCA document-access contract. The customer workspace itself remains authenticated.

## Migration implications

Before production release:

1. introduce a Kairoseth service adapter that passes the canonical organization ID;
2. make connector credentials provisionable/revocable from Kairoseth;
3. ensure production storage keys and queries are organization scoped;
4. expose the workspace through Kairoseth product RBAC;
5. proxy the public QR route through kairoseth.com;
6. keep the engine's local bootstrap organization/key facilities disabled or inaccessible from customer surfaces.

## Connector implication

The WooCommerce connector already accepts an HTTPS endpoint plus organization-scoped API key. Its configuration UX will ultimately receive those values from Kairoseth Platform rather than from a separate Puente DeCA signup.
