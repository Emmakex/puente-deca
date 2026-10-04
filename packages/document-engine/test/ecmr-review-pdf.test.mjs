import test from "node:test";
import assert from "node:assert/strict";
import {
  PDFDocument
} from "pdf-lib";
import {
  MAX_ECMR_REVIEW_PDF_BYTES,
  renderVerifiedEcmrReviewPdf
} from "../src/ecmr-review-pdf.mjs";

const baseVersion = {
  versionId:
    "ecmrv_demo_001",
  version: 1,
  createdAt:
    "2026-10-04T18:20:00.000Z",
  actor: {
    actorId:
      "kairoseth-user:edu",
    partyRole:
      "sender",
    identityScheme:
      "kairoseth-user"
  },
  reason:
    "initial structured issue",
  contentHash:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  reviewHash:
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  reviewSnapshot: {
    documentType:
      "eCMR",
    messageStandard:
      "UN/CEFACT eCMR",
    messageRelease:
      "D25A",
    externalReference:
      "SHIP-2026-0001",
    issue: {
      date:
        "2026-10-04",
      place:
        "Barcelona"
    },
    sender: {
      legalName:
        "Łódź Sender SL",
      address:
        "Carrer d'Àngel Guimerà 1, Barcelona"
    },
    contractualCarrier: {
      legalName:
        "Транспорт Núñez SL",
      address:
        "Carrer de Provença 10, Barcelona"
    },
    takingOver: {
      date:
        "2026-10-05",
      place:
        "Sabadell"
    },
    delivery: {
      place:
        "Lyon"
    },
    consignee: {
      legalName:
        "Example Consignee SAS",
      address:
        "10 Rue Example, Lyon"
    },
    goods: {
      nature:
        "Mobiliari Việt Nam",
      packingMethod:
        "Pallets",
      packingMethodCode:
        "PX",
      dangerousGoods: {
        declared:
          false
      },
      packages: {
        count: 4,
        marksAndNumbers: [
          "BX-001",
          "BX-002"
        ]
      },
      quantity: {
        value: 420,
        unit: "kg"
      }
    },
    charges: {
      declared: true,
      items: [
        {
          description:
            "Main carriage",
          chargeCategoryCode:
            "FC",
          amount: {
            value: 250,
            currency: "EUR"
          }
        }
      ]
    },
    customsFormalities: {
      declared: true,
      instructions: [
        "Keep invoice with transport documents"
      ]
    },
    conventionApplicability: {
      declared: true,
      statement:
        "This carriage is subject to the CMR Convention."
    },
    authentication: {
      state: "pending"
    },
    integrity: {
      state: "pending"
    }
  }
};

test("renders a Unicode human-review PDF clearly marked as not issued", async () => {
  const pdf =
    await renderVerifiedEcmrReviewPdf({
      shipmentId:
        "shp_demo_001",
      version:
        baseVersion,
      schemaConformance:
        "pending-official-xsd-validation"
    });
  const loaded =
    await PDFDocument.load(
      pdf,
      {
        updateMetadata:
          false
      }
    );

  assert.equal(
    pdf.subarray(0, 8)
      .toString(
        "latin1"
      ),
    "%PDF-1.7"
  );
  assert.equal(
    loaded.getTitle(),
    "eCMR review ecmrv_demo_001"
  );
  assert.equal(
    loaded.getSubject(),
    "Verifiable human review of eCMR — NOT ISSUED"
  );
  assert.equal(
    loaded.getProducer(),
    "Puente DeCA"
  );
  assert.equal(
    loaded
      .getCreationDate()
      .toISOString(),
    baseVersion.createdAt
  );
  assert.ok(
    loaded.getPageCount() >=
      1
  );
  assert.ok(
    pdf.includes(
      Buffer.from(
        "/ToUnicode"
      )
    )
  );
  assert.ok(
    pdf.length <
      MAX_ECMR_REVIEW_PDF_BYTES
  );
});

test("fails closed for unsupported supplementary symbols", async () => {
  const unsupported =
    structuredClone(
      baseVersion
    );
  unsupported
    .reviewSnapshot
    .sender
    .legalName =
      "Transport 🚚";

  await assert.rejects(
    () =>
      renderVerifiedEcmrReviewPdf({
        shipmentId:
          "shp_demo_001",
        version:
          unsupported,
        schemaConformance:
          "pending-official-xsd-validation"
      }),
    (error) =>
      error.code ===
        "ECMR_PDF_UNSUPPORTED_CHARACTER" &&
      error.character ===
        "🚚"
  );
});

test("enforces the eCMR review PDF byte ceiling", async () => {
  await assert.rejects(
    () =>
      renderVerifiedEcmrReviewPdf(
        {
          shipmentId:
            "shp_demo_001",
          version:
            baseVersion,
          schemaConformance:
            "pending-official-xsd-validation"
        },
        {
          maxBytes: 500
        }
      ),
    (error) =>
      error.code ===
        "ECMR_REVIEW_PDF_TOO_LARGE" &&
      error.maxBytes ===
        500 &&
      error.size >
        500
  );
});
