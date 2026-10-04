import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHash,
  generateKeyPairSync
} from "node:crypto";
import { createServer } from "../src/server.mjs";
import {
  createFixedWindowRateLimiter
} from "../src/rate-limit.mjs";
import {
  JsonStore
} from "../../../packages/persistence/src/json-store.mjs";
import {
  FileArtifactStore
} from "../../../packages/persistence/src/file-artifact-store.mjs";
import {
  canonicalJson
} from "../../../packages/core/src/canonical-json.mjs";
import {
  createEcmrDetachedSignature
} from "../../../packages/ecmr-signature/src/detached-signature.mjs";
import {
  ECMR_D25A_PROFILE
} from "../../../packages/ecmr-xml/src/d25a-profile.mjs";

const payload = {
  externalReference: "SHIP-2026-0100",
  contractualShipper: {
    legalName: "Example Shipper SL",
    taxId: "B12345678",
    address: "Calle Ejemplo 1, Madrid"
  },
  effectiveCarrier: {
    legalName: "Example Carrier SL",
    taxId: "B87654321"
  },
  route: {
    origin: "Madrid",
    destination: "Barcelona"
  },
  goods: {
    nature: "Furniture",
    weight: {
      value: 420,
      unit: "kg"
    }
  },
  transport: {
    date: "2026-10-05",
    vehicle: {
      tractorRegistration: "1234ABC",
      trailerRegistration: null
    },
    specialTrafficAuthorization: null
  },
  observations: null
};

const ecmrDraft = () => ({
  sender: {
    legalName:
      "Example Sender SL",
    address:
      "Calle Ejemplo 1, Madrid"
  },
  contractualCarrier: {
    legalName:
      "Example Contractual Carrier SL",
    address:
      "Avenida Transport 2, Barcelona"
  },
  consignee: {
    legalName:
      "Example Consignee SAS",
    address:
      "10 Rue Example, Lyon"
  },
  issue: {
    date: "2026-10-04",
    place: "Madrid"
  },
  takingOver: {
    date: "2026-10-05",
    place: "Madrid"
  },
  delivery: {
    place: "Lyon"
  },
  goods: {
    packingMethod:
      "Pallets",
    packingMethodCode:
      "PX",
    packages: {
      count: 8,
      marksAndNumbers: [
        "PAL-1",
        "PAL-8"
      ]
    },
    dangerousGoods: {
      declared: false
    }
  },
  charges: {
    declared: true,
    items: []
  },
  customsFormalities: {
    declared: true,
    instructions: []
  },
  conventionApplicability: {
    declared: true,
    statement:
      "This carriage is subject to the CMR Convention notwithstanding any clause to the contrary."
  }
});

const sha256Evidence = (
  value
) =>
  `sha256:${createHash("sha256")
    .update(value)
    .digest("hex")}`;

const officialD25aAcceptanceEvidence = (
  xmlSha256
) => {
  const placeholderHash =
    `sha256:${"a".repeat(64)}`;
  const core = {
    evidenceVersion: 1,
    status: "pass",
    check:
      "ecmr-d25a-generated-xml-acceptance",
    generatedAt:
      "2026-10-04T19:00:00.000Z",
    projectionSha256:
      placeholderHash,
    serializer: {
      release:
        ECMR_D25A_PROFILE.release,
      rootSchema:
        ECMR_D25A_PROFILE.rootSchema,
      mappedProjectionPaths: [
        "issue.date"
      ],
      pendingProjectionPaths: []
    },
    validation: {
      schemaConformance:
        "official-d25a-xsd-pass",
      release:
        ECMR_D25A_PROFILE.release,
      sourceFile:
        ECMR_D25A_PROFILE
          .sourceFileName,
      sourceFileId:
        ECMR_D25A_PROFILE
          .sourceFileId,
      archiveSha256:
        placeholderHash,
      nestedSchemaArchive:
        ECMR_D25A_PROFILE
          .nestedSchemaArchive,
      nestedSchemaArchiveSha256:
        placeholderHash,
      rootSchema:
        ECMR_D25A_PROFILE
          .rootSchema,
      rootSchemaSha256:
        placeholderHash,
      schemaFileCount: 42,
      schemaTreeSha256:
        placeholderHash,
      xmlSha256,
      networkAccess: false
    }
  };

  return {
    ...core,
    evidenceSha256:
      sha256Evidence(
        Buffer.from(
          canonicalJson(core),
          "utf8"
        )
      )
  };
};

const PLATFORM_SERVICE_SECRET =
  "kairoseth-ci-service-secret-0123456789abcdef";

const withOperationalServer = async (
  fn,
  serverOptions = {}
) => {
  const directory = await mkdtemp(
    join(tmpdir(), "puente-deca-api-")
  );
  let apiKeySequence = 0;
  const store = await JsonStore.open({
    filePath: join(
      directory,
      "store.json"
    ),
    apiKeyFactory: () => {
      apiKeySequence += 1;
      return `pdeca_test_operational_${String(
        apiKeySequence
      ).padStart(4, "0")}_abcdefghijklmnop`;
    }
  });
  const artifactStore =
    await FileArtifactStore.open({
      rootDirectory: join(
        directory,
        "documents"
      )
    });

  const organization =
    await store.createOrganization({
      name: "Organization 001"
    });
  await store.setOrganizationConnectorAccessUntil({
    organizationId:
      organization.organizationId,
    validUntil:
      new Date("2030-01-01T00:00:00.000Z")
  });

  const createdCredential =
    await store.createApiCredential({
      organizationId:
        organization.organizationId,
      name: "integration test"
    });

  const server = createServer({
    publicBaseUrl:
      "https://deca.example.com/public",
    store,
    artifactStore,
    platformServiceSecret:
      PLATFORM_SERVICE_SECRET,
    ...serverOptions
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    await fn({
      baseUrl:
        `http://127.0.0.1:${address.port}`,
      apiKey: createdCredential.apiKey,
      apiCredential:
        createdCredential.credential,
      organization,
      store,
      platformServiceSecret:
        PLATFORM_SERVICE_SECRET
    });
  } finally {
    server.close();
    await once(server, "close");
    await rm(directory, {
      recursive: true,
      force: true
    });
  }
};

const authHeaders = (apiKey) => ({
  authorization: `Bearer ${apiKey}`,
  "content-type": "application/json"
});

test("operational flow stores a DeCA and exposes its prefixed QR URL directly", async () => {
  await withOperationalServer(
    async ({ baseUrl, apiKey, store, organization }) => {
      const createResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers: {
            ...authHeaders(apiKey),
            "idempotency-key":
              "order-2026-0100"
          },
          body: JSON.stringify(payload)
        }
      );
      const shipment =
        await createResponse.json();

      assert.equal(
        createResponse.status,
        201
      );
      assert.match(
        shipment.shipmentId,
        /^shp_/
      );
      assert.equal(
        Object.hasOwn(
          shipment,
          "aggregate"
        ),
        false
      );

      const internalShipment =
        await store.getShipment({
          organizationId:
            organization.organizationId,
          shipmentId:
            shipment.shipmentId
        });

      assert.equal(
        internalShipment.aggregate
          .contractVersion,
        "2026-10"
      );
      assert.equal(
        internalShipment.aggregate
          .externalReference,
        payload.externalReference
      );
      assert.equal(
        internalShipment.aggregate
          .regulatoryContexts[0]
          .type,
        "deca"
      );

      const replayResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers: {
            ...authHeaders(apiKey),
            "idempotency-key":
              "order-2026-0100"
          },
          body: JSON.stringify(payload)
        }
      );
      const replay =
        await replayResponse.json();

      assert.equal(replayResponse.status, 200);
      assert.equal(
        replay.shipmentId,
        shipment.shipmentId
      );
      assert.equal(
        replay.idempotentReplay,
        true
      );

      const generateResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
          {
            method: "POST",
            headers: authHeaders(apiKey)
          }
        );
      const generated =
        await generateResponse.json();

      assert.equal(
        generateResponse.status,
        201
      );
      assert.equal(
        generated.document.version,
        1
      );
      assert.equal(generated.reused, false);
      assert.match(
        generated.artifact.sha256,
        /^sha256:[a-f0-9]{64}$/
      );
      assert.equal(
        generated.artifact.retentionNotBefore,
        "2027-10-05T00:00:00.000Z"
      );

      const repeatedGeneration =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
          {
            method: "POST",
            headers: authHeaders(apiKey)
          }
        );
      const repeated =
        await repeatedGeneration.json();

      assert.equal(
        repeatedGeneration.status,
        200
      );
      assert.equal(repeated.reused, true);
      assert.equal(
        repeated.document.documentId,
        generated.document.documentId
      );

      const accessPath =
        new URL(
          generated.document.accessUrl
        ).pathname;

      assert.match(
        accessPath,
        /^\/public\/d\//
      );

      const publicResponse = await fetch(
        `${baseUrl}${accessPath}`
      );
      const pdf = Buffer.from(
        await publicResponse.arrayBuffer()
      );

      assert.equal(
        publicResponse.status,
        200
      );
      assert.equal(
        publicResponse.headers.get(
          "content-type"
        ),
        "application/pdf"
      );
      assert.equal(
        pdf.subarray(0, 8).toString(
          "latin1"
        ),
        "%PDF-1.7"
      );

      const metadataResponse =
        await fetch(
          `${baseUrl}/v1/deca/${generated.document.documentId}`,
          {
            headers: {
              authorization:
                `Bearer ${apiKey}`
            }
          }
        );
      const metadata =
        await metadataResponse.json();

      assert.equal(
        metadataResponse.status,
        200
      );
      assert.equal(
        metadata.artifact.sha256,
        generated.artifact.sha256
      );

      const shipmentResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}`,
          {
            headers: {
              authorization:
                `Bearer ${apiKey}`
            }
          }
        );

      assert.equal(
        shipmentResponse.status,
        200
      );

      const storedShipment =
        await shipmentResponse.json();
      assert.deepEqual(
        storedShipment.documentVersionIds,
        [generated.document.documentId]
      );
      assert.equal(
        Object.hasOwn(
          storedShipment,
          "aggregate"
        ),
        false
      );

      const listResponse =
        await fetch(
          `${baseUrl}/v1/shipments?limit=10`,
          {
            headers:
              authHeaders(apiKey)
          }
        );
      const listed =
        await listResponse.json();

      assert.equal(
        listResponse.status,
        200
      );
      assert.ok(
        listed.items.length >= 1
      );
      assert.equal(
        listed.items.some(
          (item) =>
            Object.hasOwn(
              item,
              "aggregate"
            )
        ),
        false
      );

      const events =
        await store.listAuditEvents({
          organizationId:
            organization.organizationId,
          shipmentId:
            shipment.shipmentId
        });

      assert.deepEqual(
        events.map(
          (event) => event.type
        ),
        [
          "shipment.created",
          "document.version.created"
        ]
      );
    }
  );
});

test("document generation is Shipment-first when legacy data diverges internally", async () => {
  await withOperationalServer(
    async ({ baseUrl, apiKey, store, organization }) => {
      const createResponse =
        await fetch(
          `${baseUrl}/v1/shipments`,
          {
            method: "POST",
            headers: authHeaders(apiKey),
            body:
              JSON.stringify(payload)
          }
        );
      const shipment =
        await createResponse.json();

      assert.equal(
        createResponse.status,
        201
      );

      const internal =
        await store.getShipment({
          organizationId:
            organization.organizationId,
          shipmentId:
            shipment.shipmentId
        });

      const staleLegacy =
        structuredClone(
          internal.data
        );
      staleLegacy.route.destination =
        "Valencia";

      await store.updateShipment({
        organizationId:
          organization.organizationId,
        shipmentId:
          shipment.shipmentId,
        data:
          staleLegacy,
        aggregate:
          internal.aggregate
      });

      const generateResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
          {
            method: "POST",
            headers:
              authHeaders(apiKey)
          }
        );
      const generated =
        await generateResponse.json();

      assert.equal(
        generateResponse.status,
        201
      );
      assert.equal(
        generated.document.data
          .route.destination,
        "Barcelona"
      );
      assert.equal(
        generated.artifact
          .retentionNotBefore,
        "2027-10-05T00:00:00.000Z"
      );
    }
  );
});

test("Kairoseth usage endpoint counts canonical DeCA versions across connector traffic", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      apiKey,
      organization,
      store,
      platformServiceSecret
    }) => {
      const createdResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers: {
            ...authHeaders(apiKey),
            "idempotency-key":
              "usage-order-001"
          },
          body: JSON.stringify(payload)
        }
      );
      const shipment =
        await createdResponse.json();

      const firstResponse = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
        {
          method: "POST",
          headers: authHeaders(apiKey)
        }
      );
      assert.equal(firstResponse.status, 201);

      const replayResponse = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
        {
          method: "POST",
          headers: authHeaders(apiKey)
        }
      );
      const replay = await replayResponse.json();
      assert.equal(replayResponse.status, 200);
      assert.equal(replay.reused, true);

      const usageHeaders = {
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organization.organizationId
      };
      const firstUsageResponse = await fetch(
        `${baseUrl}/v1/usage/documents?from=2026-01-01T00%3A00%3A00.000Z&to=2027-01-01T00%3A00%3A00.000Z`,
        { headers: usageHeaders }
      );
      const firstUsage =
        await firstUsageResponse.json();

      assert.equal(firstUsageResponse.status, 200);
      assert.equal(firstUsage.documents, 1);
      assert.equal(
        firstUsage.organizationId,
        organization.organizationId
      );

      const changed = structuredClone(payload);
      changed.route.destination = "Valencia";
      const updateResponse = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}`,
        {
          method: "PUT",
          headers: authHeaders(apiKey),
          body: JSON.stringify(changed)
        }
      );
      assert.equal(updateResponse.status, 200);
      const updateBody =
        await updateResponse.json();
      assert.equal(
        Object.hasOwn(
          updateBody,
          "aggregate"
        ),
        false
      );

      const migratedInternal =
        await store.getShipment({
          organizationId:
            organization.organizationId,
          shipmentId:
            shipment.shipmentId
        });

      assert.equal(
        migratedInternal.aggregate
          .route.destination,
        "Valencia"
      );

      const secondResponse = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
        {
          method: "POST",
          headers: authHeaders(apiKey)
        }
      );
      assert.equal(secondResponse.status, 201);

      const secondUsageResponse = await fetch(
        `${baseUrl}/v1/usage/documents?from=2026-01-01T00%3A00%3A00.000Z&to=2027-01-01T00%3A00%3A00.000Z`,
        { headers: usageHeaders }
      );
      const secondUsage =
        await secondUsageResponse.json();

      assert.equal(secondUsageResponse.status, 200);
      assert.equal(secondUsage.documents, 2);

      const connectorDenied = await fetch(
        `${baseUrl}/v1/usage/documents?from=2026-01-01T00%3A00%3A00.000Z&to=2027-01-01T00%3A00%3A00.000Z`,
        {
          headers: {
            authorization: `Bearer ${apiKey}`
          }
        }
      );
      assert.equal(connectorDenied.status, 401);
    }
  );
});

test("Kairoseth usage endpoint rejects invalid or excessive time windows", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      organization,
      platformServiceSecret
    }) => {
      const headers = {
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organization.organizationId
      };

      const invalid = await fetch(
        `${baseUrl}/v1/usage/documents?from=nope&to=also-nope`,
        { headers }
      );
      assert.equal(invalid.status, 400);

      const excessive = await fetch(
        `${baseUrl}/v1/usage/documents?from=2020-01-01T00%3A00%3A00.000Z&to=2030-01-01T00%3A00%3A00.000Z`,
        { headers }
      );
      assert.equal(excessive.status, 400);
    }
  );
});

test("Kairoseth can read the organization connector-access lease for acceptance evidence", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      organization,
      platformServiceSecret
    }) => {
      const headers = {
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organization.organizationId,
        "content-type": "application/json"
      };

      const before = await fetch(
        `${baseUrl}/v1/access/connectors`,
        { headers }
      );
      assert.equal(before.status, 200);
      const initial = await before.json();
      assert.equal(
        initial.organizationId,
        organization.organizationId
      );

      const updated = await fetch(
        `${baseUrl}/v1/access/connectors`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            validUntil:
              "2031-01-02T03:04:05.000Z"
          })
        }
      );
      assert.equal(updated.status, 200);

      const after = await fetch(
        `${baseUrl}/v1/access/connectors`,
        { headers }
      );
      assert.equal(after.status, 200);
      assert.deepEqual(
        await after.json(),
        {
          organizationId:
            organization.organizationId,
          validUntil:
            "2031-01-02T03:04:05.000Z"
        }
      );
    }
  );
});

test("Kairoseth previews CSV and XLSX imports through the canonical validator", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      organization,
      platformServiceSecret
    }) => {
      const headers = {
        "content-type": "application/json",
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organization.organizationId
      };
      const csv = [
        "external_reference,shipper_name,shipper_tax_id,shipper_address,carrier_name,carrier_tax_id,origin,destination,goods_nature,weight_value,weight_unit,alternative_measure_value,alternative_measure_unit,transport_date,tractor_registration,trailer_registration,special_traffic_authorization,observations",
        "SHIP-IMPORT-001,Example Shipper SL,B12345678,Madrid,Example Carrier SL,B87654321,Madrid,Barcelona,Furniture,420,kg,,,2026-10-05,1234ABC,,,Handle carefully"
      ].join("\n");

      const csvResponse = await fetch(
        `${baseUrl}/v1/import/preview`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            format: "csv",
            dataBase64:
              Buffer.from(csv).toString("base64")
          })
        }
      );
      assert.equal(csvResponse.status, 200);
      const csvPreview = await csvResponse.json();
      assert.equal(csvPreview.total, 1);
      assert.equal(csvPreview.valid, 1);
      assert.equal(csvPreview.invalid, 0);
      assert.equal(
        csvPreview.records[0].request.externalReference,
        "SHIP-IMPORT-001"
      );

      const workbook = await readFile(
        join(
          process.cwd(),
          "examples/file-import/shipments.xlsx"
        )
      );
      const xlsxResponse = await fetch(
        `${baseUrl}/v1/import/preview`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            format: "xlsx",
            dataBase64:
              workbook.toString("base64")
          })
        }
      );
      assert.equal(xlsxResponse.status, 200);
      const xlsxPreview = await xlsxResponse.json();
      assert.equal(xlsxPreview.total, 2);
      assert.equal(xlsxPreview.valid, 2);
      assert.equal(xlsxPreview.invalid, 0);
    }
  );
});

test("Kairoseth commits validated CSV imports idempotently and refuses invalid files before creation", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      organization,
      store,
      platformServiceSecret
    }) => {
      const headers = {
        "content-type": "application/json",
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organization.organizationId
      };
      const validCsv = [
        "external_reference,shipper_name,shipper_tax_id,shipper_address,carrier_name,carrier_tax_id,origin,destination,goods_nature,weight_value,weight_unit,alternative_measure_value,alternative_measure_unit,transport_date,tractor_registration,trailer_registration,special_traffic_authorization,observations",
        "SHIP-COMMIT-001,Example Shipper SL,B12345678,Madrid,Example Carrier SL,B87654321,Madrid,Barcelona,Furniture,420,kg,,,2026-10-05,1234ABC,,,Handle carefully"
      ].join("\n");

      const first = await fetch(
        `${baseUrl}/v1/import/shipments`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            format: "csv",
            dataBase64:
              Buffer.from(validCsv).toString("base64")
          })
        }
      );
      assert.equal(first.status, 201);
      const firstBody = await first.json();
      assert.equal(firstBody.created, 1);
      assert.equal(firstBody.replayed, 0);
      assert.equal(firstBody.conflicts, 0);

      const second = await fetch(
        `${baseUrl}/v1/import/shipments`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            format: "csv",
            dataBase64:
              Buffer.from(validCsv).toString("base64")
          })
        }
      );
      assert.equal(second.status, 200);
      const secondBody = await second.json();
      assert.equal(secondBody.created, 0);
      assert.equal(secondBody.replayed, 1);
      assert.equal(secondBody.conflicts, 0);

      const beforeInvalid =
        await store.listShipments({
          organizationId:
            organization.organizationId,
          limit: 100
        });

      const invalidCsv = [
        "external_reference,transport_date",
        ",not-a-date"
      ].join("\n");
      const invalid = await fetch(
        `${baseUrl}/v1/import/shipments`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            format: "csv",
            dataBase64:
              Buffer.from(invalidCsv).toString("base64")
          })
        }
      );
      assert.equal(invalid.status, 422);
      const invalidBody = await invalid.json();
      assert.equal(
        invalidBody.error,
        "import_validation_failed"
      );
      assert.equal(invalidBody.invalid, 1);

      const afterInvalid =
        await store.listShipments({
          organizationId:
            organization.organizationId,
          limit: 100
        });
      assert.equal(
        afterInvalid.total,
        beforeInvalid.total
      );
    }
  );
});

test("Kairoseth import preview keeps invalid rows and rejects malformed payloads", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      organization,
      platformServiceSecret
    }) => {
      const headers = {
        "content-type": "application/json",
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organization.organizationId
      };
      const csv =
        "external_reference,transport_date\n,not-a-date\n";

      const preview = await fetch(
        `${baseUrl}/v1/import/preview`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            format: "csv",
            dataBase64:
              Buffer.from(csv).toString("base64")
          })
        }
      );
      assert.equal(preview.status, 200);
      const body = await preview.json();
      assert.equal(body.total, 1);
      assert.equal(body.valid, 0);
      assert.equal(body.invalid, 1);
      assert.ok(body.records[0].errors.length > 0);

      const malformed = await fetch(
        `${baseUrl}/v1/import/preview`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            format: "pdf",
            dataBase64: "not-base64"
          })
        }
      );
      assert.equal(malformed.status, 422);
    }
  );
});

test("connector access lease disables existing Bearer keys after expiry", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      apiKey,
      organization,
      platformServiceSecret
    }) => {
      const platformHeaders = {
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organization.organizationId,
        "content-type": "application/json"
      };

      const leaseResponse = await fetch(
        `${baseUrl}/v1/access/connectors`,
        {
          method: "PUT",
          headers: platformHeaders,
          body: JSON.stringify({
            validUntil:
              "2020-01-01T00:00:00.000Z"
          })
        }
      );
      assert.equal(leaseResponse.status, 200);

      const denied = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            authorization:
              `Bearer ${apiKey}`
          }
        }
      );
      assert.equal(denied.status, 401);

      const restored = await fetch(
        `${baseUrl}/v1/access/connectors`,
        {
          method: "PUT",
          headers: platformHeaders,
          body: JSON.stringify({
            validUntil:
              "2030-01-01T00:00:00.000Z"
          })
        }
      );
      assert.equal(restored.status, 200);

      const allowed = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            authorization:
              `Bearer ${apiKey}`
          }
        }
      );
      assert.equal(allowed.status, 200);
    }
  );
});

test("Kairoseth downloads connector packages through platform authentication", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      organization,
      platformServiceSecret
    }) => {
      const headers = {
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organization.organizationId
      };

      const woo = await fetch(
        `${baseUrl}/v1/connectors/woocommerce/package`,
        { headers }
      );
      assert.equal(woo.status, 200);
      assert.equal(
        woo.headers.get("content-type"),
        "application/zip"
      );
      assert.match(
        woo.headers.get("content-disposition") ?? "",
        /puente-deca-woocommerce-0\.1\.0\.zip/
      );
      assert.match(
        woo.headers.get("x-connector-sha256") ?? "",
        /^[0-9a-f]{64}$/
      );
      const wooBytes =
        Buffer.from(await woo.arrayBuffer());
      assert.equal(
        wooBytes.readUInt32LE(0),
        0x04034b50
      );

      const unauthenticated = await fetch(
        `${baseUrl}/v1/connectors/prestashop/package`
      );
      assert.equal(
        unauthenticated.status,
        401
      );
    }
  );
});

test("operational routes reject missing API credentials", async () => {
  await withOperationalServer(
    async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      assert.equal(response.status, 401);
    }
  );
});


test("updates a shipment and generates a linked DeCA revision", async () => {
  await withOperationalServer(
    async ({ baseUrl, apiKey, store, organization }) => {
      const createResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers: {
            ...authHeaders(apiKey),
            "idempotency-key":
              "order-update-001"
          },
          body: JSON.stringify(payload)
        }
      );
      const shipment =
        await createResponse.json();

      const firstResponse = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
        {
          method: "POST",
          headers: authHeaders(apiKey)
        }
      );
      const first =
        await firstResponse.json();

      assert.equal(firstResponse.status, 201);
      assert.equal(first.document.version, 1);

      const changedPayload =
        structuredClone(payload);
      changedPayload.route.destination =
        "Sabadell";
      changedPayload.transport.vehicle
        .tractorRegistration = "9999ZZZ";

      const updateResponse = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}`,
        {
          method: "PUT",
          headers: authHeaders(apiKey),
          body: JSON.stringify(
            changedPayload
          )
        }
      );
      const updated =
        await updateResponse.json();

      assert.equal(updateResponse.status, 200);
      assert.equal(updated.changed, true);
      assert.equal(
        updated.data.route.destination,
        "Sabadell"
      );

      const secondResponse = await fetch(
        `${baseUrl}/v1/shipments/${shipment.shipmentId}/deca`,
        {
          method: "POST",
          headers: authHeaders(apiKey)
        }
      );
      const second =
        await secondResponse.json();

      assert.equal(secondResponse.status, 201);
      assert.equal(second.document.version, 2);
      assert.equal(
        second.document.previousVersionId,
        first.document.documentId
      );
      assert.notEqual(
        second.document.contentHash,
        first.document.contentHash
      );

      const events =
        await store.listAuditEvents({
          organizationId:
            organization.organizationId,
          shipmentId:
            shipment.shipmentId
        });

      assert.deepEqual(
        events.map((event) => event.type),
        [
          "shipment.created",
          "document.version.created",
          "shipment.updated",
          "document.version.created"
        ]
      );
    }
  );
});


test("Kairoseth service auth lazily provisions and lists an isolated organization", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      platformServiceSecret,
      store
    }) => {
      const organizationId =
        "kairoseth-org-001";
      const headers = {
        "content-type": "application/json",
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organizationId,
        "idempotency-key":
          "platform-shipment-001"
      };

      const createdResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        }
      );
      const created =
        await createdResponse.json();

      assert.equal(createdResponse.status, 201);
      assert.equal(
        created.organizationId,
        organizationId
      );

      const organization =
        await store.getOrganization(
          organizationId
        );
      assert.equal(
        organization.externalReference,
        organizationId
      );

      const listResponse = await fetch(
        `${baseUrl}/v1/shipments?limit=10`,
        {
          headers: {
            "x-kairoseth-service-secret":
              platformServiceSecret,
            "x-kairoseth-organization-id":
              organizationId
          }
        }
      );
      const list =
        await listResponse.json();

      assert.equal(listResponse.status, 200);
      assert.equal(list.total, 1);
      assert.equal(list.items.length, 1);
      assert.equal(
        list.items[0].shipmentId,
        created.shipmentId
      );

      const otherResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            "x-kairoseth-service-secret":
              platformServiceSecret,
            "x-kairoseth-organization-id":
              "kairoseth-org-002"
          }
        }
      );
      const other =
        await otherResponse.json();

      assert.equal(otherResponse.status, 200);
      assert.equal(other.total, 0);
      assert.deepEqual(other.items, []);
    }
  );
});

test("Kairoseth service auth rejects an invalid shared secret", async () => {
  await withOperationalServer(
    async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            "x-kairoseth-service-secret":
              "invalid-service-secret",
            "x-kairoseth-organization-id":
              "kairoseth-org-001"
          }
        }
      );

      assert.equal(response.status, 401);
    }
  );
});


test("Kairoseth manages connector credentials with one-time secret reveal", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      platformServiceSecret
    }) => {
      const organizationId =
        "kairoseth-org-credentials";
      const serviceHeaders = {
        "content-type": "application/json",
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organizationId
      };

      const leaseResponse = await fetch(
        `${baseUrl}/v1/access/connectors`,
        {
          method: "PUT",
          headers: serviceHeaders,
          body: JSON.stringify({
            validUntil:
              "2030-01-01T00:00:00.000Z"
          })
        }
      );
      assert.equal(leaseResponse.status, 200);

      const createResponse = await fetch(
        `${baseUrl}/v1/credentials`,
        {
          method: "POST",
          headers: serviceHeaders,
          body: JSON.stringify({
            name: "WooCommerce production",
            kind: "woocommerce"
          })
        }
      );
      const created =
        await createResponse.json();

      assert.equal(createResponse.status, 201);
      assert.match(
        created.apiKey,
        /^pdeca_test_operational_/
      );
      assert.equal(
        created.credential.name,
        "WooCommerce production"
      );
      assert.equal(
        created.credential.kind,
        "woocommerce"
      );
      assert.equal(
        Object.hasOwn(
          created.credential,
          "keyHash"
        ),
        false
      );

      const listResponse = await fetch(
        `${baseUrl}/v1/credentials`,
        {
          headers: {
            "x-kairoseth-service-secret":
              platformServiceSecret,
            "x-kairoseth-organization-id":
              organizationId
          }
        }
      );
      const listed =
        await listResponse.json();

      assert.equal(listResponse.status, 200);
      assert.equal(listed.items.length, 1);
      assert.equal(
        listed.items[0].kind,
        "woocommerce"
      );
      assert.equal(
        Object.hasOwn(
          listed.items[0],
          "apiKey"
        ),
        false
      );

      const invalidKind = await fetch(
        `${baseUrl}/v1/credentials`,
        {
          method: "POST",
          headers: serviceHeaders,
          body: JSON.stringify({
            name: "Unsupported connector",
            kind: "magento"
          })
        }
      );
      assert.equal(invalidKind.status, 422);

      const legacyDefaultResponse = await fetch(
        `${baseUrl}/v1/credentials`,
        {
          method: "POST",
          headers: serviceHeaders,
          body: JSON.stringify({
            name: "Legacy API integration"
          })
        }
      );
      assert.equal(
        legacyDefaultResponse.status,
        201
      );
      const legacyDefault =
        await legacyDefaultResponse.json();
      assert.equal(
        legacyDefault.credential.kind,
        "api"
      );

      const connectorResponse = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            authorization:
              `Bearer ${created.apiKey}`
          }
        }
      );
      assert.equal(
        connectorResponse.status,
        200
      );

      const connectorCannotMint =
        await fetch(
          `${baseUrl}/v1/credentials`,
          {
            method: "POST",
            headers: {
              authorization:
                `Bearer ${created.apiKey}`,
              "content-type":
                "application/json"
            },
            body: JSON.stringify({
              name: "forbidden"
            })
          }
        );
      assert.equal(
        connectorCannotMint.status,
        401
      );

      const revokeResponse = await fetch(
        `${baseUrl}/v1/credentials/${created.credential.credentialId}`,
        {
          method: "DELETE",
          headers: {
            "x-kairoseth-service-secret":
              platformServiceSecret,
            "x-kairoseth-organization-id":
              organizationId
          }
        }
      );
      const revoked =
        await revokeResponse.json();

      assert.equal(revokeResponse.status, 200);
      assert.ok(
        revoked.credential.revokedAt
      );

      const rejectedAfterRevocation =
        await fetch(
          `${baseUrl}/v1/shipments`,
          {
            headers: {
              authorization:
                `Bearer ${created.apiKey}`
            }
          }
        );
      assert.equal(
        rejectedAfterRevocation.status,
        401
      );
    }
  );
});

test("Kairoseth can synchronize connector credential expiry and expired keys stop authenticating", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      platformServiceSecret
    }) => {
      const organizationId =
        "kairoseth-org-expiring-credentials";
      const serviceHeaders = {
        "content-type": "application/json",
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organizationId
      };

      const leaseResponse = await fetch(
        `${baseUrl}/v1/access/connectors`,
        {
          method: "PUT",
          headers: serviceHeaders,
          body: JSON.stringify({
            validUntil:
              "2099-01-01T00:00:00.000Z"
          })
        }
      );
      assert.equal(leaseResponse.status, 200);

      const createResponse = await fetch(
        `${baseUrl}/v1/credentials`,
        {
          method: "POST",
          headers: serviceHeaders,
          body: JSON.stringify({
            name: "WooCommerce paid period",
            expiresAt:
              "2099-01-01T00:00:00.000Z"
          })
        }
      );
      const created =
        await createResponse.json();

      assert.equal(createResponse.status, 201);
      assert.equal(
        created.credential.expiresAt,
        "2099-01-01T00:00:00.000Z"
      );

      const beforeExpiry = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            authorization:
              `Bearer ${created.apiKey}`
          }
        }
      );
      assert.equal(beforeExpiry.status, 200);

      const syncResponse = await fetch(
        `${baseUrl}/v1/credentials`,
        {
          method: "PATCH",
          headers: serviceHeaders,
          body: JSON.stringify({
            expiresAt:
              "2000-01-01T00:00:00.000Z"
          })
        }
      );
      const synced =
        await syncResponse.json();

      assert.equal(syncResponse.status, 200);
      assert.equal(synced.updated, 1);

      const afterExpiry = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            authorization:
              `Bearer ${created.apiKey}`
          }
        }
      );
      assert.equal(afterExpiry.status, 401);

      const invalid = await fetch(
        `${baseUrl}/v1/credentials`,
        {
          method: "PATCH",
          headers: serviceHeaders,
          body: JSON.stringify({
            expiresAt: "not-a-date"
          })
        }
      );
      assert.equal(invalid.status, 422);
    }
  );
});

test("Kairoseth platform manages tenant-scoped eCMR signer keys without private-key custody", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      apiKey,
      organization,
      platformServiceSecret
    }) => {
      const first =
        generateKeyPairSync(
          "ed25519"
        );
      const second =
        generateKeyPairSync(
          "ed25519"
        );
      const publicPem = (
        pair
      ) =>
        pair.publicKey
          .export({
            type: "spki",
            format: "pem"
          })
          .toString();
      const serviceHeaders = {
        "content-type":
          "application/json",
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organization.organizationId,
        "x-kairoseth-user-id":
          "user_signer_admin"
      };
      const signer = {
        signerId:
          "kairoseth-user:user_signer_admin",
        partyRole:
          "sender",
        identityScheme:
          "kairoseth-user",
        identityAssurance:
          "platform-authenticated"
      };
      const custody = (
        reference
      ) => ({
        mode: "external",
        provider:
          "Example External HSM",
        keyReference:
          reference,
        controlModel:
          "external-sole-control"
      });

      const createdResponse =
        await fetch(
          `${baseUrl}/v1/ecmr/signer-keys`,
          {
            method: "POST",
            headers:
              serviceHeaders,
            body:
              JSON.stringify({
                label:
                  "Sender key v1",
                publicKeyPem:
                  publicPem(
                    first
                  ),
                signer,
                custody:
                  custody(
                    "hsm://org/key-001"
                  )
              })
          }
        );
      const created =
        await createdResponse
          .json();

      assert.equal(
        createdResponse.status,
        201
      );
      assert.match(
        created.signerKey
          .publicKeyFingerprint,
        /^sha256:[0-9a-f]{64}$/
      );
      assert.equal(
        Object.hasOwn(
          created.signerKey,
          "publicKeyPem"
        ),
        false
      );
      assert.equal(
        created.signerKey
          .custody
          .privateKeyStored,
        false
      );

      const listedResponse =
        await fetch(
          `${baseUrl}/v1/ecmr/signer-keys`,
          {
            headers:
              serviceHeaders
          }
        );
      const listed =
        await listedResponse
          .json();

      assert.equal(
        listedResponse.status,
        200
      );
      assert.equal(
        listed.items.length,
        1
      );
      assert.equal(
        Object.hasOwn(
          listed.items[0],
          "publicKeyPem"
        ),
        false
      );

      const connectorDenied =
        await fetch(
          `${baseUrl}/v1/ecmr/signer-keys`,
          {
            headers: {
              authorization:
                `Bearer ${apiKey}`
            }
          }
        );

      assert.equal(
        connectorDenied.status,
        401
      );

      const rotateResponse =
        await fetch(
          `${baseUrl}/v1/ecmr/signer-keys/${created.signerKey.signerKeyId}/rotate`,
          {
            method: "POST",
            headers:
              serviceHeaders,
            body:
              JSON.stringify({
                label:
                  "Sender key v2",
                publicKeyPem:
                  publicPem(
                    second
                  ),
                custody:
                  custody(
                    "hsm://org/key-002"
                  ),
                reason:
                  "scheduled rotation"
              })
          }
        );
      const rotation =
        await rotateResponse
          .json();

      assert.equal(
        rotateResponse.status,
        201
      );
      assert.equal(
        rotation.previous
          .revokedReason,
        "scheduled rotation"
      );
      assert.equal(
        rotation.next
          .replacesSignerKeyId,
        created.signerKey
          .signerKeyId
      );

      const revokeResponse =
        await fetch(
          `${baseUrl}/v1/ecmr/signer-keys/${rotation.next.signerKeyId}/revoke`,
          {
            method: "POST",
            headers:
              serviceHeaders,
            body:
              JSON.stringify({
                reason:
                  "retired"
              })
          }
        );
      const revoked =
        await revokeResponse
          .json();

      assert.equal(
        revokeResponse.status,
        200
      );
      assert.equal(
        revoked.signerKey
          .revokedReason,
        "retired"
      );
    }
  );
});

test("credential API rejects unsupported scopes", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      platformServiceSecret
    }) => {
      const response = await fetch(
        `${baseUrl}/v1/credentials`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-kairoseth-service-secret":
              platformServiceSecret,
            "x-kairoseth-organization-id":
              "kairoseth-org-scope-test"
          },
          body: JSON.stringify({
            name: "Bad scope",
            scopes: ["admin:everything"]
          })
        }
      );

      assert.equal(response.status, 422);
    }
  );
});


test("structured eCMR preview and append generate D25A internally without exposing XML", async () => {
  let tick = 0;

  await withOperationalServer(
    async ({
      baseUrl,
      apiKey,
      store,
      organization,
      apiCredential
    }) => {
      const createResponse =
        await fetch(
          `${baseUrl}/v1/shipments`,
          {
            method: "POST",
            headers:
              authHeaders(apiKey),
            body:
              JSON.stringify(
                payload
              )
          }
        );
      const shipment =
        await createResponse
          .json();

      assert.equal(
        createResponse.status,
        201
      );

      const previewResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/preview`,
          {
            method: "POST",
            headers:
              authHeaders(apiKey),
            body:
              JSON.stringify({
                draft:
                  ecmrDraft()
              })
          }
        );
      const preview =
        await previewResponse
          .json();

      assert.equal(
        previewResponse.status,
        200
      );
      assert.equal(
        preview.valid,
        true
      );
      assert.equal(
        preview.projection
          .sender.legalName,
        "Example Sender SL"
      );
      assert.equal(
        preview.projection
          .goods.quantity.value,
        420
      );
      assert.equal(
        preview.wire.release,
        "D25A"
      );
      assert.equal(
        preview.wire
          .schemaConformance,
        "pending-official-xsd-validation"
      );
      assert.match(
        preview.wire.contentHash,
        /^sha256:[0-9a-f]{64}$/
      );
      assert.equal(
        Object.hasOwn(
          preview,
          "xml"
        ),
        false
      );
      assert.equal(
        JSON.stringify(
          preview
        ).includes(
          "<rsm:eCMR"
        ),
        false
      );

      const invalidDraft =
        ecmrDraft();
      invalidDraft.sender = {
        legalName: "",
        address: ""
      };

      const invalidResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/preview`,
          {
            method: "POST",
            headers:
              authHeaders(apiKey),
            body:
              JSON.stringify({
                draft:
                  invalidDraft
              })
          }
        );
      const invalid =
        await invalidResponse
          .json();

      assert.equal(
        invalidResponse.status,
        422
      );
      assert.equal(
        invalid.valid,
        false
      );
      assert.ok(
        invalid.validation
          .errors.some(
            (entry) =>
              entry.path ===
                "sender.legalName" &&
              entry.legalBasis ===
                "CMR_6_1_B"
          )
      );
      assert.equal(
        JSON.stringify(
          invalid
        ).includes(
          "<rsm:eCMR"
        ),
        false
      );

      const firstResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions/structured`,
          {
            method: "POST",
            headers:
              authHeaders(apiKey),
            body:
              JSON.stringify({
                draft:
                  ecmrDraft(),
                reason:
                  "initial structured issue",
                partyRole:
                  "sender",
                expectedPreviousVersionId:
                  null,
                actorId:
                  "spoofed"
              })
          }
        );
      const first =
        await firstResponse
          .json();

      assert.equal(
        firstResponse.status,
        201
      );
      assert.equal(
        first.version.version,
        1
      );
      assert.equal(
        first.version.actor
          .actorId,
        `credential:${apiCredential.credentialId}`
      );
      assert.equal(
        Object.hasOwn(
          first.version,
          "xml"
        ),
        false
      );
      assert.equal(
        JSON.stringify(
          first
        ).includes(
          "<rsm:eCMR"
        ),
        false
      );
      assert.equal(
        first.version.contentHash,
        preview.wire.contentHash
      );
      assert.equal(
        first.version
          .reviewSnapshot
          .sender.legalName,
        "Example Sender SL"
      );
      assert.match(
        first.version.reviewHash,
        /^sha256:[0-9a-f]{64}$/
      );

      const internalVersions =
        await store
          .listRegulatoryVersions({
            organizationId:
              organization.organizationId,
            shipmentId:
              shipment.shipmentId,
            regulatoryType:
              "ecmr"
          });

      assert.equal(
        internalVersions.length,
        1
      );
      assert.match(
        internalVersions[0].xml,
        /<rsm:eCMR /
      );
      assert.match(
        internalVersions[0].xml,
        /<ram:ConsignorTradeParty>/
      );
      assert.match(
        internalVersions[0].xml,
        /Example Sender SL/
      );
      assert.equal(
        internalVersions[0]
          .contentHash,
        preview.wire
          .contentHash
      );
      assert.equal(
        internalVersions[0]
          .reviewSnapshot
          .consignee.address,
        "10 Rue Example, Lyon"
      );
      assert.equal(
        internalVersions[0]
          .reviewHash,
        first.version
          .reviewHash
      );

      const structuredHistoryResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions`,
          {
            headers:
              authHeaders(apiKey)
          }
        );
      const structuredHistory =
        await structuredHistoryResponse
          .json();

      assert.equal(
        structuredHistoryResponse.status,
        200
      );
      assert.equal(
        structuredHistory.versions[0]
          .reviewSnapshot
          .sender.legalName,
        "Example Sender SL"
      );
      assert.equal(
        structuredHistory.versions[0]
          .reviewHash,
        first.version
          .reviewHash
      );

      const reviewPdfResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions/${first.version.versionId}/review.pdf`,
          {
            headers:
              authHeaders(apiKey)
          }
        );
      const reviewPdf =
        Buffer.from(
          await reviewPdfResponse
            .arrayBuffer()
        );

      assert.equal(
        reviewPdfResponse.status,
        200
      );
      assert.equal(
        reviewPdfResponse.headers
          .get(
            "content-type"
          ),
        "application/pdf"
      );
      assert.equal(
        reviewPdfResponse.headers
          .get(
            "x-ecmr-issuance-status"
          ),
        "not-issued"
      );
      assert.equal(
        reviewPdfResponse.headers
          .get(
            "x-ecmr-content-hash"
          ),
        first.version
          .contentHash
      );
      assert.equal(
        reviewPdfResponse.headers
          .get(
            "x-ecmr-review-hash"
          ),
        first.version
          .reviewHash
      );
      assert.equal(
        reviewPdf
          .subarray(0, 8)
          .toString(
            "latin1"
          ),
        "%PDF-1.7"
      );

      const noOpResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions/structured`,
          {
            method: "POST",
            headers:
              authHeaders(apiKey),
            body:
              JSON.stringify({
                draft:
                  ecmrDraft(),
                reason:
                  "same structured content",
                partyRole:
                  "sender",
                expectedPreviousVersionId:
                  first.version
                    .versionId
              })
          }
        );

      assert.equal(
        noOpResponse.status,
        409
      );

      const changedDraft =
        ecmrDraft();
      changedDraft.consignee.address =
        "20 Rue Updated, Lyon";

      const secondResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions/structured`,
          {
            method: "POST",
            headers:
              authHeaders(apiKey),
            body:
              JSON.stringify({
                draft:
                  changedDraft,
                reason:
                  "correct consignee address",
                partyRole:
                  "sender",
                expectedPreviousVersionId:
                  first.version
                    .versionId
              })
          }
        );
      const second =
        await secondResponse
          .json();

      assert.equal(
        secondResponse.status,
        201
      );
      assert.equal(
        second.version.version,
        2
      );
      assert.equal(
        second.version
          .previousVersionId,
        first.version
          .versionId
      );
      assert.equal(
        second.preview
          .projection
          .consignee.address,
        "20 Rue Updated, Lyon"
      );
      assert.equal(
        Object.hasOwn(
          second.version,
          "xml"
        ),
        false
      );
      assert.equal(
        second.version
          .reviewSnapshot
          .consignee.address,
        "20 Rue Updated, Lyon"
      );
      assert.match(
        second.version.reviewHash,
        /^sha256:[0-9a-f]{64}$/
      );
    },
    {
      now: () => {
        const date =
          new Date(
            1760001000000 +
            tick * 1000
          );
        tick += 1;
        return date;
      }
    }
  );
});

test("eCMR amendment API preserves exact XML, derives actor identity and rejects stale heads", async () => {
  let tick = 0;

  await withOperationalServer(
    async ({
      baseUrl,
      apiKey,
      apiCredential
    }) => {
      const createShipment =
        await fetch(
          `${baseUrl}/v1/shipments`,
          {
            method: "POST",
            headers:
              authHeaders(apiKey),
            body:
              JSON.stringify(
                payload
              )
          }
        );
      const shipment =
        await createShipment
          .json();

      assert.equal(
        createShipment.status,
        201
      );

      const xmlOne =
        "  \n<rsm:eCMR>original</rsm:eCMR>\n  ";

      const firstResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions`,
          {
            method: "POST",
            headers:
              authHeaders(apiKey),
            body:
              JSON.stringify({
                xml:
                  xmlOne,
                reason:
                  "initial issue",
                partyRole:
                  "sender",
                expectedPreviousVersionId:
                  null,
                actorId:
                  "spoofed-client-actor"
              })
          }
        );
      const first =
        await firstResponse
          .json();

      assert.equal(
        firstResponse.status,
        201
      );
      assert.equal(
        first.version.version,
        1
      );
      assert.equal(
        first.version.xml,
        xmlOne
      );
      assert.equal(
        first.version.actor.actorId,
        `credential:${apiCredential.credentialId}`
      );
      assert.notEqual(
        first.version.actor.actorId,
        "spoofed-client-actor"
      );
      assert.equal(
        first.version.actor
          .identityScheme,
        "kairoseth-api-credential"
      );

      const unavailableReview =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions/${first.version.versionId}/review.pdf`,
          {
            headers:
              authHeaders(apiKey)
          }
        );
      const unavailableBody =
        await unavailableReview
          .json();

      assert.equal(
        unavailableReview.status,
        409
      );
      assert.equal(
        unavailableBody.error,
        "ecmr_review_unavailable"
      );

      const listOne =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions`,
          {
            headers:
              authHeaders(apiKey)
          }
        );
      const historyOne =
        await listOne.json();

      assert.equal(
        listOne.status,
        200
      );
      assert.equal(
        historyOne.total,
        1
      );
      assert.equal(
        historyOne.head
          .versionId,
        first.version
          .versionId
      );
      assert.equal(
        historyOne.versions[0]
          .xml,
        xmlOne
      );

      const xmlTwo =
        "\n<rsm:eCMR>corrected</rsm:eCMR>\n";

      const secondResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions`,
          {
            method: "POST",
            headers:
              authHeaders(apiKey),
            body:
              JSON.stringify({
                xml:
                  xmlTwo,
                reason:
                  "correct consignee",
                partyRole:
                  "carrier",
                expectedPreviousVersionId:
                  first.version
                    .versionId
              })
          }
        );
      const second =
        await secondResponse
          .json();

      assert.equal(
        secondResponse.status,
        201
      );
      assert.equal(
        second.version.version,
        2
      );
      assert.equal(
        second.version
          .previousVersionId,
        first.version.versionId
      );
      assert.equal(
        second.version.xml,
        xmlTwo
      );

      const staleResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions`,
          {
            method: "POST",
            headers:
              authHeaders(apiKey),
            body:
              JSON.stringify({
                xml:
                  "<rsm:eCMR>stale</rsm:eCMR>",
                reason:
                  "stale editor",
                partyRole:
                  "sender",
                expectedPreviousVersionId:
                  first.version
                    .versionId
              })
          }
        );
      const stale =
        await staleResponse
          .json();

      assert.equal(
        staleResponse.status,
        409
      );
      assert.equal(
        stale.error,
        "ecmr_stale_head"
      );
      assert.equal(
        stale.currentVersionId,
        second.version
          .versionId
      );

      const noOpResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions`,
          {
            method: "POST",
            headers:
              authHeaders(apiKey),
            body:
              JSON.stringify({
                xml:
                  xmlTwo,
                reason:
                  "no content change",
                partyRole:
                  "carrier",
                expectedPreviousVersionId:
                  second.version
                    .versionId
              })
          }
        );
      const noOp =
        await noOpResponse
          .json();

      assert.equal(
        noOpResponse.status,
        409
      );
      assert.equal(
        noOp.error,
        "ecmr_version_conflict"
      );

      const finalList =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions`,
          {
            headers:
              authHeaders(apiKey)
          }
        );
      const finalHistory =
        await finalList.json();

      assert.equal(
        finalHistory.total,
        2
      );
      assert.deepEqual(
        finalHistory.versions.map(
          (entry) =>
            entry.version
        ),
        [1, 2]
      );
    },
    {
      now: () => {
        const value =
          new Date(
            1760000000000 +
            tick * 1000
          );
        tick += 1;
        return value;
      }
    }
  );
});

test("Kairoseth service auth binds trusted human user context to eCMR amendments", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      platformServiceSecret
    }) => {
      const organizationId =
        "kairoseth-org-ecmr-human";
      const userId =
        "user_01HUMANACTOR";
      const serviceHeaders = {
        "content-type":
          "application/json",
        "x-kairoseth-service-secret":
          platformServiceSecret,
        "x-kairoseth-organization-id":
          organizationId,
        "x-kairoseth-user-id":
          userId
      };

      const shipmentResponse =
        await fetch(
          `${baseUrl}/v1/shipments`,
          {
            method: "POST",
            headers:
              serviceHeaders,
            body:
              JSON.stringify(
                payload
              )
          }
        );
      const shipment =
        await shipmentResponse
          .json();

      assert.equal(
        shipmentResponse.status,
        201
      );

      const appendResponse =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions`,
          {
            method: "POST",
            headers:
              serviceHeaders,
            body:
              JSON.stringify({
                xml:
                  "<rsm:eCMR>human</rsm:eCMR>",
                reason:
                  "authorized workspace amendment",
                partyRole:
                  "sender",
                expectedPreviousVersionId:
                  null
              })
          }
        );
      const appended =
        await appendResponse
          .json();

      assert.equal(
        appendResponse.status,
        201
      );
      assert.equal(
        appended.version.actor
          .actorId,
        `kairoseth-user:${userId}`
      );
      assert.equal(
        appended.version.actor
          .identityScheme,
        "kairoseth-user"
      );

      const invalidContext =
        await fetch(
          `${baseUrl}/v1/shipments`,
          {
            headers: {
              "x-kairoseth-service-secret":
                platformServiceSecret,
              "x-kairoseth-organization-id":
                organizationId,
              "x-kairoseth-user-id":
                "bad user id with spaces"
            }
          }
        );

      assert.equal(
        invalidContext.status,
        401
      );
    }
  );
});

test("eCMR amendment API requires regulatory scopes", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      store,
      organization
    }) => {
      const limited =
        await store
          .createApiCredential({
            organizationId:
              organization
                .organizationId,
            name:
              "legacy connector",
            scopes: [
              "shipments:read",
              "shipments:write",
              "documents:read",
              "documents:write"
            ]
          });

      const shipmentResponse =
        await fetch(
          `${baseUrl}/v1/shipments`,
          {
            method: "POST",
            headers:
              authHeaders(
                limited.apiKey
              ),
            body:
              JSON.stringify(
                payload
              )
          }
        );
      const shipment =
        await shipmentResponse
          .json();

      assert.equal(
        shipmentResponse.status,
        201
      );

      const deniedRead =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions`,
          {
            headers:
              authHeaders(
                limited.apiKey
              )
          }
        );
      assert.equal(
        deniedRead.status,
        403
      );

      const deniedWrite =
        await fetch(
          `${baseUrl}/v1/shipments/${shipment.shipmentId}/ecmr/versions`,
          {
            method: "POST",
            headers:
              authHeaders(
                limited.apiKey
              ),
            body:
              JSON.stringify({
                xml:
                  "<rsm:eCMR/>",
                reason:
                  "initial issue",
                partyRole:
                  "sender",
                expectedPreviousVersionId:
                  null
              })
          }
        );

      assert.equal(
        deniedWrite.status,
        403
      );
    }
  );
});


test("operational readiness probes metadata and artifact stores", async () => {
  await withOperationalServer(
    async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/ready`
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, {
        status: "ready",
        service: "puente-deca",
        components: {
          metadata: "ok",
          artifacts: "ok"
        }
      });
    }
  );
});

test("metrics are Prometheus-compatible and protected by Kairoseth service auth", async () => {
  await withOperationalServer(
    async ({
      baseUrl,
      platformServiceSecret
    }) => {
      await fetch(`${baseUrl}/health`);

      const response = await fetch(
        `${baseUrl}/metrics`,
        {
          headers: {
            "x-kairoseth-service-secret":
              platformServiceSecret
          }
        }
      );
      const body = await response.text();

      assert.equal(response.status, 200);
      assert.match(
        response.headers.get(
          "content-type"
        ),
        /text\/plain/
      );
      assert.match(
        body,
        /puente_deca_requests_total/
      );
      assert.match(
        body,
        /puente_deca_active_requests/
      );
      assert.match(
        body,
        /puente_deca_responses_2xx_total/
      );
      assert.doesNotMatch(
        body,
        /organization|shipment|credential/i
      );
    }
  );
});


test("authenticated connector requests are rate limited per credential", async () => {
  const rateLimiter =
    createFixedWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      now: () => 1_000
    });

  await withOperationalServer(
    async ({ baseUrl, apiKey }) => {
      const first = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            authorization:
              `Bearer ${apiKey}`
          }
        }
      );
      const second = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            authorization:
              `Bearer ${apiKey}`
          }
        }
      );
      const third = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            authorization:
              `Bearer ${apiKey}`
          }
        }
      );
      const body = await third.json();

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(third.status, 429);
      assert.equal(
        third.headers.get("retry-after"),
        "60"
      );
      assert.equal(
        body.error,
        "rate_limited"
      );
    },
    { rateLimiter }
  );
});

test("rate limit subjects isolate connector credentials", async () => {
  const rateLimiter =
    createFixedWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      now: () => 5_000
    });

  await withOperationalServer(
    async ({
      baseUrl,
      apiKey,
      store,
      organization
    }) => {
      const secondCredential =
        await store.createApiCredential({
          organizationId:
            organization.organizationId,
          name: "second connector"
        });

      const first = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            authorization:
              `Bearer ${apiKey}`
          }
        }
      );
      const firstBlocked = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            authorization:
              `Bearer ${apiKey}`
          }
        }
      );
      const second = await fetch(
        `${baseUrl}/v1/shipments`,
        {
          headers: {
            authorization:
              `Bearer ${secondCredential.apiKey}`
          }
        }
      );

      assert.equal(first.status, 200);
      assert.equal(
        firstBlocked.status,
        429
      );
      assert.equal(second.status, 200);
    },
    { rateLimiter }
  );
});
