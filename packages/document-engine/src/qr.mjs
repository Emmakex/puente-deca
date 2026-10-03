export const QR_VERSION = 8;
export const QR_ECC_LEVEL = "M";
export const QR_SIZE = 17 + QR_VERSION * 4;
export const QR_MAX_BYTES = 152;

const DATA_CODEWORDS = 154;
const ECC_PER_BLOCK = 22;
const BLOCK_DATA_COUNTS = [38, 38, 39, 39];

const EXP = new Uint8Array(512);
const LOG = new Int16Array(256);
LOG.fill(-1);

let fieldValue = 1;
for (let index = 0; index < 255; index += 1) {
  EXP[index] = fieldValue;
  LOG[fieldValue] = index;
  fieldValue <<= 1;
  if (fieldValue & 0x100) fieldValue ^= 0x11d;
}
for (let index = 255; index < 512; index += 1) {
  EXP[index] = EXP[index - 255];
}

const gfMultiply = (left, right) =>
  left === 0 || right === 0
    ? 0
    : EXP[LOG[left] + LOG[right]];

const multiplyPolynomials = (left, right) => {
  const output = new Uint8Array(left.length + right.length - 1);

  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      output[i + j] ^= gfMultiply(left[i], right[j]);
    }
  }

  return [...output];
};

const buildGenerator = (degree) => {
  let generator = [1];

  for (let index = 0; index < degree; index += 1) {
    generator = multiplyPolynomials(
      generator,
      [1, EXP[index]]
    );
  }

  return generator;
};

const RS_GENERATOR = buildGenerator(ECC_PER_BLOCK);

const reedSolomonRemainder = (data) => {
  const message = [
    ...data,
    ...new Array(ECC_PER_BLOCK).fill(0)
  ];

  for (let index = 0; index < data.length; index += 1) {
    const factor = message[index];
    if (factor === 0) continue;

    for (
      let generatorIndex = 0;
      generatorIndex < RS_GENERATOR.length;
      generatorIndex += 1
    ) {
      message[index + generatorIndex] ^=
        gfMultiply(RS_GENERATOR[generatorIndex], factor);
    }
  }

  return message.slice(data.length);
};

class BitBuffer {
  constructor() {
    this.bits = [];
  }

  put(value, length) {
    for (let bit = length - 1; bit >= 0; bit -= 1) {
      this.bits.push(((value >>> bit) & 1) !== 0);
    }
  }
}

const buildCodewords = (text) => {
  if (typeof text !== "string" || text.length === 0) {
    throw new TypeError("QR content must be a non-empty string");
  }

  const bytes = [...Buffer.from(text, "utf8")];

  if (bytes.length > QR_MAX_BYTES) {
    const error = new Error(
      `QR content exceeds version ${QR_VERSION}-${QR_ECC_LEVEL} capacity`
    );
    error.code = "DECA_QR_CAPACITY_EXCEEDED";
    error.bytes = bytes.length;
    error.maxBytes = QR_MAX_BYTES;
    throw error;
  }

  const bits = new BitBuffer();
  bits.put(0b0100, 4);
  bits.put(bytes.length, 8);

  for (const byte of bytes) bits.put(byte, 8);

  const remaining = DATA_CODEWORDS * 8 - bits.bits.length;
  for (
    let index = 0;
    index < Math.min(4, remaining);
    index += 1
  ) {
    bits.bits.push(false);
  }

  while (bits.bits.length % 8 !== 0) {
    bits.bits.push(false);
  }

  const data = [];
  for (let index = 0; index < bits.bits.length; index += 8) {
    let byte = 0;

    for (let bit = 0; bit < 8; bit += 1) {
      byte = (byte << 1) |
        (bits.bits[index + bit] ? 1 : 0);
    }

    data.push(byte);
  }

  let useEcPad = true;
  while (data.length < DATA_CODEWORDS) {
    data.push(useEcPad ? 0xec : 0x11);
    useEcPad = !useEcPad;
  }

  const blocks = [];
  let offset = 0;

  for (const dataCount of BLOCK_DATA_COUNTS) {
    const blockData = data.slice(offset, offset + dataCount);
    offset += dataCount;

    blocks.push({
      data: blockData,
      ecc: reedSolomonRemainder(blockData)
    });
  }

  const codewords = [];

  for (let index = 0; index < 39; index += 1) {
    for (const block of blocks) {
      if (index < block.data.length) {
        codewords.push(block.data[index]);
      }
    }
  }

  for (let index = 0; index < ECC_PER_BLOCK; index += 1) {
    for (const block of blocks) {
      codewords.push(block.ecc[index]);
    }
  }

  return codewords;
};

const highestBit = (value) =>
  value === 0 ? -1 : 31 - Math.clz32(value);

const bchTypeInfo = (data) => {
  let value = data << 10;
  const generator = 0x537;

  while (highestBit(value) >= highestBit(generator)) {
    value ^= generator <<
      (highestBit(value) - highestBit(generator));
  }

  return ((data << 10) | value) ^ 0x5412;
};

const bchVersion = (version) => {
  let value = version << 12;
  const generator = 0x1f25;

  while (highestBit(value) >= highestBit(generator)) {
    value ^= generator <<
      (highestBit(value) - highestBit(generator));
  }

  return (version << 12) | value;
};

export function encodeQrMatrix(text) {
  const modules = Array.from(
    { length: QR_SIZE },
    () => Array(QR_SIZE).fill(false)
  );
  const isFunction = Array.from(
    { length: QR_SIZE },
    () => Array(QR_SIZE).fill(false)
  );

  const setFunction = (row, column, dark = true) => {
    if (
      row < 0 ||
      row >= QR_SIZE ||
      column < 0 ||
      column >= QR_SIZE
    ) {
      return;
    }

    modules[row][column] = dark;
    isFunction[row][column] = true;
  };

  const drawFinder = (row, column) => {
    for (let rowOffset = -1; rowOffset <= 7; rowOffset += 1) {
      for (
        let columnOffset = -1;
        columnOffset <= 7;
        columnOffset += 1
      ) {
        const targetRow = row + rowOffset;
        const targetColumn = column + columnOffset;

        if (
          targetRow < 0 ||
          targetRow >= QR_SIZE ||
          targetColumn < 0 ||
          targetColumn >= QR_SIZE
        ) {
          continue;
        }

        const inside =
          rowOffset >= 0 &&
          rowOffset <= 6 &&
          columnOffset >= 0 &&
          columnOffset <= 6;

        const dark =
          inside &&
          (
            rowOffset === 0 ||
            rowOffset === 6 ||
            columnOffset === 0 ||
            columnOffset === 6 ||
            (
              rowOffset >= 2 &&
              rowOffset <= 4 &&
              columnOffset >= 2 &&
              columnOffset <= 4
            )
          );

        setFunction(targetRow, targetColumn, dark);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, QR_SIZE - 7);
  drawFinder(QR_SIZE - 7, 0);

  const alignmentPositions = [6, 24, 42];

  for (const row of alignmentPositions) {
    for (const column of alignmentPositions) {
      if (isFunction[row][column]) continue;

      for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
        for (
          let columnOffset = -2;
          columnOffset <= 2;
          columnOffset += 1
        ) {
          const distance = Math.max(
            Math.abs(rowOffset),
            Math.abs(columnOffset)
          );

          setFunction(
            row + rowOffset,
            column + columnOffset,
            distance !== 1
          );
        }
      }
    }
  }

  for (let index = 8; index < QR_SIZE - 8; index += 1) {
    if (!isFunction[6][index]) {
      setFunction(6, index, index % 2 === 0);
    }

    if (!isFunction[index][6]) {
      setFunction(index, 6, index % 2 === 0);
    }
  }

  const formatBits = bchTypeInfo(0);
  const formatBit = (index) =>
    ((formatBits >>> index) & 1) !== 0;

  for (let index = 0; index < 15; index += 1) {
    const dark = formatBit(index);

    if (index < 6) {
      setFunction(index, 8, dark);
    } else if (index < 8) {
      setFunction(index + 1, 8, dark);
    } else {
      setFunction(QR_SIZE - 15 + index, 8, dark);
    }
  }

  for (let index = 0; index < 15; index += 1) {
    const dark = formatBit(index);

    if (index < 8) {
      setFunction(8, QR_SIZE - index - 1, dark);
    } else if (index < 9) {
      setFunction(8, 15 - index, dark);
    } else {
      setFunction(8, 14 - index, dark);
    }
  }

  setFunction(QR_SIZE - 8, 8, true);

  const versionBits = bchVersion(QR_VERSION);
  const versionBit = (index) =>
    ((versionBits >>> index) & 1) !== 0;

  for (let index = 0; index < 18; index += 1) {
    const row = Math.floor(index / 3);
    const column = QR_SIZE - 11 + (index % 3);
    const dark = versionBit(index);

    setFunction(row, column, dark);
    setFunction(column, row, dark);
  }

  const codewords = buildCodewords(text);
  const dataBits = [];

  for (const byte of codewords) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      dataBits.push(((byte >>> bit) & 1) !== 0);
    }
  }

  let dataIndex = 0;

  for (
    let rightColumn = QR_SIZE - 1;
    rightColumn >= 1;
    rightColumn -= 2
  ) {
    if (rightColumn === 6) rightColumn = 5;

    for (let vertical = 0; vertical < QR_SIZE; vertical += 1) {
      const upward = ((rightColumn + 1) & 2) === 0;
      const row = upward
        ? QR_SIZE - 1 - vertical
        : vertical;

      for (let offset = 0; offset < 2; offset += 1) {
        const column = rightColumn - offset;
        if (isFunction[row][column]) continue;

        let dark =
          dataIndex < dataBits.length
            ? dataBits[dataIndex]
            : false;

        dataIndex += 1;

        if ((row + column) % 2 === 0) {
          dark = !dark;
        }

        modules[row][column] = dark;
      }
    }
  }

  return modules;
}
