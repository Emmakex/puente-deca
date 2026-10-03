import { writeFile } from "node:fs/promises";
import {
  renderNativeDecaPdf
} from "../../packages/document-engine/src/pdf.mjs";

const output =
  process.argv[2] ??
  "/tmp/puente-deca-unicode-smoke.pdf";

const snapshot = {
  schemaVersion: "2026-06",
  documentType: "DECA",
  documentId: "deca_unicode_smoke",
  version: 1,
  state: "prepared",
  createdAt: "2026-10-03T10:00:00.000Z",
  modifiedAt: "2026-10-03T10:00:00.000Z",
  previousVersionId: null,
  lineageCreatedAt:
    "2026-10-03T10:00:00.000Z",
  contentHash:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  accessUrl:
    "https://kairoseth.com/deca/d/unicode-smoke-token.pdf",
  data: {
    externalReference:
      "UNICODE-SMOKE-001",
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

const pdf =
  await renderNativeDecaPdf(
    snapshot
  );

await writeFile(output, pdf);

process.stdout.write(
  `${output}\n`
);
