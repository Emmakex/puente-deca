# eCMR UN/CEFACT D25A XML boundary

This repository pins the eCMR wire-standard boundary to the official UNECE publication:

- release: **D25A**;
- publication date: **2026-06-11**;
- official package: `eCMR_D25A.zip`;
- UNECE file ID: `473769`;
- nested schema bundle: `XSD/Schema.zip`;
- root schema: `uncefact/eCMR_100pD25A.xsd`.

Source page:

```text
https://unece.org/trade/documents/2026/06/ecmr-d25a
```

## Why the official XSD is not copied into Git

The schema package is an external normative artifact. Puente DeCA records the exact source identity and installs it locally when schema validation is required.

This avoids:

- silently editing or recreating normative XSDs;
- validating against an invented local approximation;
- depending on UNECE network availability at runtime;
- allowing imported XSDs to fetch remote resources during validation.

The installed schema directory is intentionally git-ignored.

## Install the official bundle

Download `eCMR_D25A.zip` from the UNECE source page, then run:

```bash
ECMR_D25A_ARCHIVE=/absolute/path/eCMR_D25A.zip \
npm run ecmr:d25a:schema-install
```

The installer:

1. requires the outer package to contain `XSD/Schema.zip`;
2. rejects absolute/path-traversal archive entries;
3. requires the nested bundle to contain `uncefact/eCMR_100pD25A.xsd`;
4. extracts the complete nested schema set so relative imports remain available;
5. records SHA-256 for the official outer archive and the root XSD;
6. writes `pdeca-manifest.json`;
7. refuses to overwrite an existing installed bundle unless:

```text
ECMR_D25A_SCHEMA_REPLACE=REPLACE_D25A_SCHEMA_BUNDLE
```

## Validate an XML

```bash
ECMR_D25A_XML=/absolute/path/document.xml \
npm run ecmr:d25a:schema-validate
```

Validation uses:

```text
xmllint --nonet --noout --schema ...
```

`--nonet` is mandatory. Schema validation must use only the installed, hash-verified UNECE bundle.

The command fails closed when:

- the bundle or manifest is missing;
- the manifest does not identify D25A;
- the root XSD hash changed;
- `xmllint` is unavailable;
- the XML fails schema validation.

## Serializer status

`serializeEcmrD25aEnvelope()` now produces a deterministic UN/CEFACT namespace-pinned XML envelope for the high-confidence nodes confirmed in the eCMR/MMT structure:

- `eCMR`;
- `ExchangedDocument`;
- `SpecifiedSupplyChainConsignment`;
- consignor/sender;
- contractual carrier;
- consignee;
- carrier acceptance location;
- consignee receipt location;
- gross weight;
- consignment item quantity.

It escapes XML-sensitive business/legal text and converts ISO dates to the UN/CEFACT `DateTimeString format="102"` representation used by this envelope.

This serializer **does not claim D25A schema conformance yet**. Its result explicitly returns:

```text
schemaConformance=pending-official-xsd-validation
```

The remaining projection fields are also returned as `pendingProjectionPaths`.

## Completion gate

The roadmap item **UN/CEFACT D25A XML serialization + schema validation** remains open until all of the following are true:

1. every legally required projection field has an explicit D25A wire mapping;
2. a complete generated XML validates against the official installed `eCMR_100pD25A.xsd` bundle;
3. the passing bundle hashes are preserved as release evidence;
4. no serializer fallback invents a legal value or silently drops a required eCMR particular.

Only then may the XML serializer be called D25A-conformant.
