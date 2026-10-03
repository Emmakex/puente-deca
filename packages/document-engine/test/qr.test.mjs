import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  encodeQrMatrix,
  QR_MAX_BYTES,
  QR_SIZE
} from "../src/qr.mjs";

const url =
  "https://deca.example.com/d/abcdefghijklmnop1234567890.pdf";

test("encodes a deterministic version 8-M QR matrix", () => {
  const matrix = encodeQrMatrix(url);

  assert.equal(matrix.length, QR_SIZE);
  assert.equal(matrix[0].length, QR_SIZE);

  const fingerprint = createHash("sha256")
    .update(
      matrix.flat().map((value) => (value ? "1" : "0")).join("")
    )
    .digest("hex");

  assert.equal(
    fingerprint,
    "1d640439c0004b19714fbcfb0217c671b46cb2d100887855e315732f1db3ec2f"
  );

  assert.equal(matrix[0][0], true);
  assert.equal(matrix[6][6], true);
  assert.equal(matrix[1][1], false);
  assert.equal(matrix[3][3], true);
});

test("rejects QR payloads beyond the supported byte capacity", () => {
  const tooLong = "x".repeat(QR_MAX_BYTES + 1);

  assert.throws(
    () => encodeQrMatrix(tooLong),
    (error) =>
      error.code === "DECA_QR_CAPACITY_EXCEEDED" &&
      error.maxBytes === QR_MAX_BYTES
  );
});
