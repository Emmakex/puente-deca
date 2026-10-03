import test from "node:test";
import assert from "node:assert/strict";
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
    "https://deca.example.com/d/abcdefghijklmnop1234567890.pdf",
  data: {
    externalReference: "SHIP-2026-0001",
    contractualShipper: {
      legalName: "Ejemplo Cargador SL",
      taxId: "B12345678",
      address: "Carrer d'Àngel Guimerà 1, Sabadell"
    },
    effectiveCarrier: {
      legalName: "Transports Núñez SL",
      taxId: "B87654321"
    },
    route: {
      origin: "Sabadell",
      destination: "Barcelona"
    },
    goods: {
      nature: "Mobiliari",
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
    observations: "Manipular amb precaució"
  }
};

test("renders a native PDF with metadata and embedded vector QR", () => {
  const pdf = renderNativeDecaPdf(snapshot);
  const text = pdf.toString("latin1");

  assert.equal(
    pdf.subarray(0, 8).toString("latin1"),
    "%PDF-1.7"
  );
  assert.match(
    text,
    /\/CreationDate \(D:20261003050000Z\)/
  );
  assert.match(
    text,
    /\/ModDate \(D:20261003061530Z\)/
  );
  assert.match(text, /Cargador contractual/);
  assert.match(text, /B12345678/);
  assert.match(text, /Núñez/);
  assert.match(text, /precaució/);
  assert.match(
    text,
    /https:\/\/deca\.example\.com\/d\//
  );
  assert.ok(
    (text.match(/ re f/g) ?? []).length > 500,
    "expected QR vector modules in PDF content"
  );
  assert.ok(pdf.length < MAX_DECA_PDF_BYTES);
  assert.match(text, /%%EOF/);
});

test("fails instead of silently corrupting unsupported PDF text", () => {
  const unsupported = structuredClone(snapshot);
  unsupported.data.contractualShipper.legalName = "Łódź Logistics";

  assert.throws(
    () => renderNativeDecaPdf(unsupported),
    (error) =>
      error.code === "DECA_PDF_UNSUPPORTED_CHARACTER" &&
      error.character === "Ł"
  );
});

test("enforces the configured PDF byte ceiling", () => {
  assert.throws(
    () => renderNativeDecaPdf(snapshot, { maxBytes: 500 }),
    (error) =>
      error.code === "DECA_PDF_TOO_LARGE" &&
      error.maxBytes === 500 &&
      error.size > 500
  );
});
