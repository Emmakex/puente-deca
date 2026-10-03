import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  MAX_DECA_PDF_BYTES,
  renderNativeDecaPdf,
  requiresUnicodePdfEmbedding
} from "../src/pdf.mjs";

const baseSnapshot = {
  schemaVersion: "2026-06",
  documentType: "DECA",
  documentId: "deca_demo",
  version: 1,
  state: "prepared",
  createdAt: "2026-10-03T05:00:00.000Z",
  modifiedAt: "2026-10-03T06:15:30.000Z",
  previousVersionId: null,
  lineageCreatedAt: "2026-10-03T05:00:00.000Z",
  contentHash:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  accessUrl:
    "https://kairoseth.com/deca/d/abcdefghijklmnop1234567890.pdf",
  data: {
    externalReference:
      "SHIP-2026-0001",
    contractualShipper: {
      legalName:
        "Example Shipper SL",
      taxId: "B12345678",
      address:
        "Carrer Angel Guimera 1, Sabadell"
    },
    effectiveCarrier: {
      legalName:
        "Example Carrier SL",
      taxId: "B87654321"
    },
    route: {
      origin: "Sabadell",
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
        tractorRegistration:
          "1234ABC",
        trailerRegistration: null
      },
      specialTrafficAuthorization:
        null
    },
    observations:
      "Handle with care"
  }
};

const unicodeSnapshot =
  structuredClone(baseSnapshot);
unicodeSnapshot.data
  .contractualShipper
  .legalName =
    "Łódź Logística Ελληνική";
unicodeSnapshot.data
  .contractualShipper
  .address =
    "Carrer d'Àngel Guimerà 1, Sabadell";
unicodeSnapshot.data
  .effectiveCarrier
  .legalName =
    "Транспорт Núñez SL";
unicodeSnapshot.data.goods.nature =
  "Mobiliari Việt Nam";
unicodeSnapshot.data.observations =
  "Manipular amb precaució — Đặng Nguyễn";

test("selects the lightweight path for Latin-1 and Unicode embedding only when needed", () => {
  assert.equal(
    requiresUnicodePdfEmbedding(
      baseSnapshot
    ),
    false
  );
  assert.equal(
    requiresUnicodePdfEmbedding(
      unicodeSnapshot
    ),
    true
  );
});

test("renders a native Unicode PDF with metadata, ToUnicode mapping and vector QR", async () => {
  const pdf =
    await renderNativeDecaPdf(
      unicodeSnapshot
    );
  const loaded =
    await PDFDocument.load(
      pdf,
      { updateMetadata: false }
    );

  assert.equal(
    pdf.subarray(0, 8)
      .toString("latin1"),
    "%PDF-1.7"
  );
  assert.equal(
    loaded.getTitle(),
    "DeCA deca_demo"
  );
  assert.equal(
    loaded.getSubject(),
    "Documento electrónico de Control Administrativo"
  );
  assert.equal(
    loaded.getProducer(),
    "Puente DeCA"
  );
  assert.equal(
    loaded.getCreationDate()
      .toISOString(),
    unicodeSnapshot.createdAt
  );
  assert.equal(
    loaded.getModificationDate()
      .toISOString(),
    unicodeSnapshot.modifiedAt
  );
  assert.equal(
    loaded.getPageCount(),
    1
  );
  assert.ok(
    pdf.includes(
      Buffer.from("/ToUnicode")
    ),
    "expected Unicode character mapping in embedded font"
  );
  assert.ok(
    pdf.length <
      MAX_DECA_PDF_BYTES
  );
});

test("fails closed for scripts outside the embedded production font coverage", async () => {
  const unsupported =
    structuredClone(baseSnapshot);
  unsupported.data
    .contractualShipper
    .legalName =
      "भारत Logistics";

  await assert.rejects(
    () =>
      renderNativeDecaPdf(
        unsupported
      ),
    (error) =>
      error.code ===
        "DECA_PDF_UNSUPPORTED_CHARACTER" &&
      error.character === "भ"
  );
});

test("enforces the configured PDF byte ceiling on the fast path", async () => {
  await assert.rejects(
    () =>
      renderNativeDecaPdf(
        baseSnapshot,
        { maxBytes: 500 }
      ),
    (error) =>
      error.code ===
        "DECA_PDF_TOO_LARGE" &&
      error.maxBytes === 500 &&
      error.size > 500
  );
});
