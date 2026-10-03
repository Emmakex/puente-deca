# Security Policy

## Scope

This repository contains the Puente DeCA compliance engine and its connector implementations.

Production customer authentication, organization membership and product RBAC are owned by Kairoseth Platform. Puente DeCA must not introduce a parallel human-authentication system.

## Reporting a vulnerability

Do not publish sensitive vulnerability details in a public issue.

Prefer GitHub's private security advisory/reporting flow for this repository when available. Include:

- affected commit/version;
- affected endpoint or connector;
- reproduction steps;
- expected vs actual behavior;
- impact assessment;
- whether credentials, document URLs or customer data were exposed.

Do not include real production secrets in the report.

## Security invariants

The following are treated as release-blocking invariants:

- Kairoseth service secrets remain server-only and are compared using a timing-safe fixed-length comparison;
- connector API keys are shown once, then only hashed server-side;
- WooCommerce and PrestaShop connector secrets are encrypted at rest or storage fails closed;
- tenant access is scoped by canonical Kairoseth organization ID;
- public DeCA access is by opaque document token and returns PDF directly;
- stored PDFs are checked against SHA-256 metadata before delivery;
- production metadata uses MongoDB Atlas and PDFs use GridFS;
- local JSON/filesystem persistence is disabled in production;
- standalone lab endpoints are hidden in production;
- authenticated API traffic is rate limited;
- production startup runs fail-closed configuration preflight;
- dependency installs are locked and reproducible.

## Secrets

Never commit:

- MongoDB Atlas connection strings;
- Kairoseth server-to-server secrets;
- connector API keys;
- real customer access tokens;
- backup credentials.

The example environment file must contain empty secret values only.

## Supported release posture

The current release line is pre-production until the live acceptance gates in `docs/security-review.md` and `docs/deployment-runbook.md` are complete.
