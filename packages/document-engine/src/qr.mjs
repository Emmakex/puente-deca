import QRCode from "qrcode";

export const QR_ECC_LEVEL = "M";
export const QR_MIN_VERSION = 1;
export const QR_MAX_VERSION = 40;
export const QR_MAX_BYTES = 2331;

const capacityError = (bytes) => {
  const error = new Error(
    `QR content exceeds version ${QR_MAX_VERSION}-${QR_ECC_LEVEL} byte capacity`
  );
  error.code = "DECA_QR_CAPACITY_EXCEEDED";
  error.bytes = bytes;
  error.maxBytes = QR_MAX_BYTES;
  throw error;
};

export function encodeQrMatrix(text) {
  if (
    typeof text !== "string" ||
    text.length === 0
  ) {
    throw new TypeError(
      "QR content must be a non-empty string"
    );
  }

  const bytes = Buffer.byteLength(
    text,
    "utf8"
  );

  if (bytes > QR_MAX_BYTES) {
    capacityError(bytes);
  }

  let symbol;

  try {
    symbol = QRCode.create(text, {
      errorCorrectionLevel:
        QR_ECC_LEVEL
    });
  } catch (error) {
    if (
      /too big|too large|amount of data/i.test(
        String(error?.message ?? "")
      )
    ) {
      capacityError(bytes);
    }

    throw error;
  }

  const size = symbol?.modules?.size;
  const data = symbol?.modules?.data;

  if (
    !Number.isInteger(size) ||
    size < 21 ||
    size > 177 ||
    !data ||
    data.length !== size * size
  ) {
    const error = new Error(
      "QR encoder returned an invalid matrix"
    );
    error.code = "DECA_QR_ENCODER_INVALID";
    throw error;
  }

  return Array.from(
    { length: size },
    (_, row) =>
      Array.from(
        { length: size },
        (_, column) =>
          Boolean(
            data[
              row * size + column
            ]
          )
      )
  );
}
