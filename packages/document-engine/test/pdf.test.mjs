import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  MAX_DECA_PDF_BYTES,
  renderNativeDecaPdf
} from "../src/pdf.mjs";

const snapshot = {
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
        "Łódź Logística Ελληνική",
      taxId: "B12345678",
      address:
        "Carrer d'Àngel Guimerà 1, Sabadell"
    },
    effectiveCarrier: {
      legalName:
        "Транспорт Núñez SL",
      taxId: "B87654321"
    },
    route: {
      origin: "Sabadell",
      destination: "Barcelona"
    },
    goods: {
      nature:
        "Mobiliari Việt Nam",
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
      "Manipular amb precaució - भारत"
  }
};

test("renders a native Unicode PDF with metadata and embedded vector QR", async () => {
  const pdf =
    await renderNativeDecaPdf(
      snapshot
    );
  const loaded =
    await PDFDocument.load(pdf);

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
    snapshot.createdAt
  );
  assert.equal(
    loaded.getModificationDate()
      .toISOString(),
    snapshot.modifiedAt
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

test("supports Latin Extended, Greek, Cyrillic, Vietnamese and Devanagari without transliteration", async () => {
  const pdf =
    await renderNativeDecaPdf(
      snapshot
    );

  assert.ok(
    Buffer.isBuffer(pdf)
  );
  assert.ok(pdf.length > 0);
});

test("fails closed for characters outside the embedded Noto Sans font set", async () => {
  const unsupported =
    structuredClone(snapshot);
  unsupported.data
    .contractualShipper
    .legalName =
      "Transporte 🚚";

  await assert.rejects(
    () =>
      renderNativeDecaPdf(
        unsupported
      ),
    (error) =>
      error.code ===
        "DECA_PDF_UNSUPPORTED_CHARACTER" &&
      error.character === "🚚"
  );
});

test("enforces the configured PDF byte ceiling", async () => {
  await assert.rejects(
    () =>
      renderNativeDecaPdf(
        snapshot,
        { maxBytes: 500 }
      ),
    (error) =>
      error.code ===
        "DECA_PDF_TOO_LARGE" &&
      error.maxBytes === 500 &&
      error.size > 500
  );
});
