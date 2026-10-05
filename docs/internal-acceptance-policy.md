# DeCA internal acceptance policy

## Rule

All DeCA product and acceptance testing is performed internally by the Kairoseth team using synthetic fixtures, controlled environments and retained evidence.

Customer production data, customer stores and third-party test operators are not required to complete the DeCA acceptance roadmap.

## Testing layers

### 1. Repository CI

Unit, API, contract, security, connector, package, PDF and regression checks run against deterministic fixtures.

### 2. Internal infrastructure integration

The manual workflow `DeCA Internal Acceptance` provides reproducible internal evidence for:

- MongoDB transaction support in an isolated replica-set runtime;
- required MongoDB indexes;
- GridFS upload/read/SHA-256/delete lifecycle;
- concurrent idempotency and document-version lineage;
- exact WooCommerce and PrestaShop release ZIPs;
- PHP runtime compatibility for packaged connectors;
- synthetic WooCommerce and PrestaShop order mapping;
- encrypted connector-secret roundtrips;
- non-destructive connector read paths.

No production credentials are used in this workflow.

### 3. Kairoseth-owned infrastructure acceptance

Production-class acceptance may execute against Kairoseth-owned Hostinger/MongoDB infrastructure, but still uses isolated synthetic organizations, shipments, documents and connector credentials. This is an internal acceptance activity, not testing on a customer system.

This layer includes:

- Kairoseth public DeCA route;
- protected Kairoseth → Puente DeCA health;
- Atlas/GridFS production-class behavior;
- backup → isolated restore;
- organization isolation;
- Hostinger/CDN/WAF configuration;
- deployment/readiness/rollback validation.

### 4. Internal connector full-stack acceptance

WooCommerce and PrestaShop final compatibility gates must use Kairoseth-controlled test stores. The exact release ZIP is installed into the controlled runtime, test orders contain synthetic data, and the resulting evidence is retained.

The target matrix is:

- WordPress >= 6.5 + WooCommerce >= 8.2;
- PrestaShop 1.7.8.x;
- PrestaShop 8.x.

No customer store is required.

### 5. Internal security acceptance

Security acceptance is performed internally against the controlled deployment and includes focused penetration/security testing of:

- tenant isolation;
- connector credential scoping and revocation;
- service-secret boundaries;
- public document token behavior;
- PDF integrity and privacy headers;
- abuse/rate/concurrency controls;
- input/body limits;
- storage and retention boundaries;
- Hostinger/CDN/WAF protections.

An independent external audit can be commissioned later for commercial or assurance purposes, but it is not a prerequisite for declaring the internally agreed DeCA product scope complete.

## Evidence rule

A gate is green only when its test has actually executed in the intended internal environment and evidence has been retained. Having automation available is not sufficient by itself.

## Data rule

Acceptance fixtures must be synthetic and clearly identifiable as QA data. They must not contain copied customer names, addresses, tax identifiers, orders, access tokens or shipment information.

## Scope rule

Until these DeCA gates are complete, eCMR remains frozen and eFTI remains deferred.
