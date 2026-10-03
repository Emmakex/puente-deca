import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeQrMatrix,
  QR_ECC_LEVEL,
  QR_MAX_BYTES,
  QR_MAX_VERSION,
  QR_MIN_VERSION
} from "../src/qr.mjs";

const url =
  "https://kairoseth.com/deca/d/abcdefghijklmnop1234567890.pdf";

const versionFromSize = (size) =>
  (size - 17) / 4;

test("encodes deterministic auto-sized M-level QR matrices", () => {
  const first = encodeQrMatrix(url);
  const second = encodeQrMatrix(url);

  assert.deepEqual(first, second);
  assert.equal(
    QR_ECC_LEVEL,
    "M"
  );
  assert.equal(
    first.length,
    first[0].length
  );

  const version =
    versionFromSize(first.length);

  assert.ok(
    Number.isInteger(version)
  );
  assert.ok(
    version >= QR_MIN_VERSION
  );
  assert.ok(
    version <= QR_MAX_VERSION
  );

  assert.equal(first[0][0], true);
  assert.equal(first[6][6], true);
});

test("grows the QR version automatically for longer public URLs", () => {
  const shortMatrix =
    encodeQrMatrix(url);
  const longMatrix =
    encodeQrMatrix(
      `https://kairoseth.com/deca/d/${"a".repeat(
        900
      )}.pdf`
    );

  assert.ok(
    longMatrix.length >
      shortMatrix.length
  );
  assert.ok(
    versionFromSize(
      longMatrix.length
    ) <= QR_MAX_VERSION
  );
});

test("rejects QR payloads beyond the supported version-40 M byte capacity", () => {
  const tooLong =
    "x".repeat(
      QR_MAX_BYTES + 1
    );

  assert.throws(
    () => encodeQrMatrix(tooLong),
    (error) =>
      error.code ===
        "DECA_QR_CAPACITY_EXCEEDED" &&
      error.maxBytes ===
        QR_MAX_BYTES &&
      error.bytes ===
        QR_MAX_BYTES + 1
  );
});
