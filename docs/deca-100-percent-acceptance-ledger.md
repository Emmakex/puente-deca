# DeCA 100% acceptance ledger

This ledger is the single operational view for declaring the agreed DeCA product scope complete.

It deliberately excludes eCMR and eFTI. Those tracks remain frozen until every DeCA gate below is closed with retained evidence.

## Status meanings

- `GREEN` — implemented and accepted with retained Kairoseth-controlled evidence.
- `READY` — tooling/automation is complete, but the intended live Kairoseth-controlled execution has not yet produced retained evidence.
- `OPEN` — an operational/provider evidence step is still required and its acceptance path is not yet complete.

Customer systems and customer data are not required to close any gate. Fixtures, stores and infrastructure used for acceptance are Kairoseth-controlled and synthetic wherever application data is involved.

## Product and internal acceptance

| Gate | Status | Evidence boundary |
| --- | --- | --- |
| DeCA contract, validation and legal-field handling | GREEN | Unit/API/contract suites |
| PDF/QR generation, Unicode, size ceiling and immutable versioning | GREEN | Internal deterministic PDF/visual/contract suites |
| Tenant-scoped API, credentials, audit, retention and idempotency | GREEN | Internal API/E2E/security suites |
| MongoDB/GridFS transaction, index, lifecycle and concurrency behavior | GREEN | Isolated internal replica-set acceptance with retained evidence |
| WooCommerce packaged connector compatibility | GREEN | Exact release ZIP, PHP 8.1–8.3 plus full-stack Kairoseth-controlled stores |
| PrestaShop packaged connector compatibility | GREEN | Exact release ZIP, PHP 8.1–8.3 plus Kairoseth-controlled 1.7.8.x/8.x stores |
| Focused application-security / penetration acceptance | GREEN | Synthetic auth, tenant-isolation, token-tamper, traversal, body-limit and rate-limit suite |
| Release package/SBOM/checksum evidence | GREEN | Release-candidate workflow |

## Final Kairoseth-controlled live gates

| Gate | Status | Closure requirement |
| --- | --- | --- |
| Synthetic Cargo acceptance fixture | GREEN | Protected synthetic production fixture accepted in engine/edge runs; no customer data retained |
| Kairoseth → Puente DeCA engine deployment acceptance | GREEN | Protected production diagnostic: health, API, shipment, PDF headers and repeated hash green |
| Public DeCA route / PDF integrity | GREEN | Controlled fixture proves canonical route, privacy headers, fail-closed CSP and immutable repeated PDF SHA-256 |
| MongoDB Atlas transaction/index/concurrency | READY | Run existing fail-closed Atlas acceptance against intended Kairoseth Atlas environment |
| GridFS lifecycle + orphan reconciliation on intended Atlas | READY | Live controlled round-trip/reconciliation returns zero accepted anomalies |
| Backup → isolated DR restore | READY | Run guarded backup/restore drill against Kairoseth-controlled DR target; verify metadata↔GridFS hashes and cleanup |
| WooCommerce live-store read acceptance | READY | Run host-local read-only evidence wrapper on a Kairoseth-controlled WooCommerce acceptance store |
| PrestaShop 1.7.8.x live-store read acceptance | READY | Run host-local read-only evidence wrapper on a Kairoseth-controlled 1.7.8.x acceptance store |
| PrestaShop 8.x live-store read acceptance | READY | Run host-local read-only evidence wrapper on a Kairoseth-controlled 8.x acceptance store |
| Hostinger public edge technical acceptance | GREEN | Safe low-volume external edge gate proves PDF 200, immutable repeated hash and fail-closed CSP |
| Hostinger CDN/WAF provider configuration evidence | READY | Fail-closed verifier is complete; retain sanitized intended-production hPanel/provider evidence bound by SHA-256 to the protected Hostinger edge artifact; no disruptive DDoS/stress test |
| Infrastructure security acceptance | READY | All six control evidence/verifier paths plus the automatic fail-closed composer are complete; collect intended Atlas/Hostinger/GitHub/protected-runtime evidence and compose/promote the exact retained bundle |
| Final evidence freeze | OPEN | All rows above GREEN; pin final DeCA commit/release manifest and retained acceptance references |

## Production closure evidence — 2026-10-06

The production engine/edge rows above were promoted to `GREEN` only after the following protected, client-visible checks passed:

- Kairoseth deployed revision observed by the acceptance runs: `1f0cb171d5b9c8d1e861ac49d5f53da6b968ab94`.
- `DeCA Kairoseth Cargo CSP Edge Acceptance`, run `37441821303`, attempt 5: `http=200`, `csp_count=1`, `default_none=1`, `frame_none=1`, `upgrade_insecure=0`, `same_policy=1`, `hcdn_observed=0`, classification `fail_closed_policy_present`; sanitized evidence artifact retained by the workflow.
- `DeCA Kairoseth Cargo Engine Phase Diagnostic`, run `37415774217`, attempt 5: health, API list, shipment read, PDF status/magic/size/privacy headers/CSP, repeated PDF SHA-256 and synthetic credential revocation all passed.

The Hostinger production application is served through Passenger/LiteSpeed. The effective `public_html/.htaccess` contains a route-scoped DeCA CSP override for `/deca/d/*.pdf`. Hostinger may regenerate that file during Node.js redeploys, so the Kairoseth deployed-revision gate must also verify the client-visible DeCA CSP after each relevant deployment. A repository-only or local `.htaccess` representation is not sufficient evidence.

## Infrastructure-security tooling closure — 2026-10-06

The six-control `infrastructureSecurity` evidence path is now complete at repository level without self-certifying any live/provider state:

- deployed tenant-isolation protected producer + fail-closed Puente verifier;
- deployed readiness/rollback protected producer + fail-closed Puente verifier;
- Hostinger WAF/provider evidence verifier that keeps provider configuration evidence separate from the bounded technical edge smoke;
- Atlas least-privilege, Atlas network-access and runtime-secret-scope evidence verifier;
- automatic six-control composer that re-runs the source verifiers and passes the result through the canonical infrastructure-security validator before retention;
- final infrastructure-security promoter that hashes the exact retained bundle and binds the rollup gate to the exact Puente DeCA Git checkout.

These controls remain `READY` until their intended production/provider evidence exists and passes the corresponding verifier. Repository CI success alone must never promote them to `GREEN`.

## Mapping to the fail-closed `deca-100` manifest

The final validator at `scripts/production/final-infrastructure-acceptance.mjs` deliberately accepts only eight upstream evidence gates. The more detailed rows above roll up as follows:

| Final manifest key | Ledger evidence that must be green |
| --- | --- |
| `atlasCore` | Atlas transaction/index/concurrency + intended Atlas GridFS lifecycle/reconciliation |
| `drRestore` | Backup → isolated DR restore |
| `kairosethEngine` | Synthetic fixture + Kairoseth engine deployment + public DeCA route/PDF integrity |
| `hostingerEdge` | Safe Hostinger public edge technical acceptance |
| `infrastructureSecurity` | Hostinger provider CDN/WAF configuration + Atlas/network/deployment/secret/isolation review |
| `wooCommerceLive` | WooCommerce controlled live-store read acceptance |
| `prestaShop178Live` | PrestaShop 1.7.8.x controlled live-store read acceptance |
| `prestaShop8Live` | PrestaShop 8.x controlled live-store read acceptance |

Each final-manifest gate requires `status: "pass"` plus a retained evidence SHA-256, repository, commit, auditable run/evidence ID and UTC timestamp. The validator rejects extra fields such as raw URLs, opaque tokens, MongoDB URIs, API keys and provider credentials.

The ledger may therefore show several detailed rows before a single final-manifest key becomes eligible. No final key may be marked `pass` until every detailed row mapped to it is green.

## Hostinger edge rule

The Hostinger gate is intentionally split in two:

1. **Technical edge acceptance** is reproducible and safe. It uses the synthetic DeCA PDF and a bounded request count. It must never become a stress/DDoS test.
2. **Provider protection acceptance** is configuration evidence for CDN/WAF/volumetric controls. It is not proven by generating aggressive traffic against production.

This separation prevents a green application smoke from being misrepresented as proof of provider-level volumetric capacity.

## 100% declaration rule

DeCA may be declared `100%` only when:

1. every final Kairoseth-controlled live gate is `GREEN`;
2. each green gate has retained evidence bound to the intended repository commit/environment;
3. the eight-gate final `deca-100` manifest validates successfully without bypasses or extra secret-bearing fields;
4. the final release manifest, connector checksums and SBOM match the accepted commit;
5. eCMR/eFTI work has not been used to substitute or hide an unfinished DeCA gate.

Until then, internal engineering can be complete while product acceptance remains below 100%.
