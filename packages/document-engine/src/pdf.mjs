import { readFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  rgb
} from "pdf-lib";
import { encodeQrMatrix } from "./qr.mjs";

export const MAX_DECA_PDF_BYTES = 5_000_000;

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const TEXT_X = 50;
const TEXT_START_Y = 790;
const TEXT_SIZE = 10;
const TEXT_LEADING = 14;
const LINES_PER_PAGE = 35;

const FONT_SUBSETS = [
  "latin",
  "latin-ext",
  "greek",
  "greek-ext",
  "cyrillic",
  "cyrillic-ext",
  "vietnamese",
  "devanagari"
];

const fontSourcePromises =
  new Map();

const normalizePdfText = (value) =>
  String(value ?? "")
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ");

const fontPath = (subset) =>
  `@fontsource/noto-sans/files/noto-sans-${subset}-400-normal.woff2`;

const loadFontSource = (
  subset
) => {
  if (
    !FONT_SUBSETS.includes(
      subset
    )
  ) {
    throw new TypeError(
      `Unknown DeCA font subset: ${subset}`
    );
  }

  if (
    !fontSourcePromises.has(
      subset
    )
  ) {
    fontSourcePromises.set(
      subset,
      (async () => {
        const resolved =
          import.meta.resolve(
            fontPath(subset)
          );

        return {
          subset,
          bytes:
            await readFile(
              new URL(resolved)
            )
        };
      })()
    );
  }

  return fontSourcePromises.get(
    subset
  );
};

const unsupportedCharacter = (
  character,
  codePoint
) => {
  const error = new Error(
    `Character U+${codePoint
      .toString(16)
      .toUpperCase()
      .padStart(4, "0")} is not supported by the embedded DeCA font set`
  );
  error.code =
    "DECA_PDF_UNSUPPORTED_CHARACTER";
  error.character = character;
  error.codePoint = codePoint;
  return error;
};

const selectFontSubsets = (text) => {
  const normalized =
    normalizePdfText(text);
  const selected =
    new Set(["latin"]);

  if (
    /[\u0100-\u02AF\u1D00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF]/u.test(
      normalized
    )
  ) {
    selected.add("latin-ext");
  }

  if (
    /[\u0102\u0103\u0110\u0111\u0128\u0129\u0168\u0169\u01A0\u01A1\u01AF\u01B0\u1EA0-\u1EF9\u20AB]/u.test(
      normalized
    )
  ) {
    selected.add("vietnamese");
  }

  if (/\p{Script=Greek}/u.test(normalized)) {
    selected.add("greek");
  }

  if (
    /[\u1F00-\u1FFF]/u.test(
      normalized
    )
  ) {
    selected.add("greek-ext");
  }

  if (
    /\p{Script=Cyrillic}/u.test(
      normalized
    )
  ) {
    selected.add("cyrillic");
  }

  if (
    /[\u0500-\u052F\u1C80-\u1C8F\u2DE0-\u2DFF\uA640-\uA69F]/u.test(
      normalized
    )
  ) {
    selected.add("cyrillic-ext");
  }

  if (
    /\p{Script=Devanagari}/u.test(
      normalized
    )
  ) {
    selected.add("devanagari");
  }

  return FONT_SUBSETS.filter(
    (subset) =>
      selected.has(subset)
  );
};

const embedUnicodeFonts = async (
  pdfDoc,
  selectedSubsets
) => {
  const sources =
    await Promise.all(
      selectedSubsets.map(
        loadFontSource
      )
    );
  const entries = [];

  for (const source of sources) {
    const font =
      await pdfDoc.embedFont(
        source.bytes,
        {
          subset: true,
          customName:
            `NotoSans-${source.subset}`
        }
      );

    entries.push({
      subset: source.subset,
      font,
      characterSet:
        new Set(
          font.getCharacterSet()
        )
    });
  }

  const cache = new Map();

  const resolve = (character) => {
    const codePoint =
      character.codePointAt(0);

    if (cache.has(codePoint)) {
      return cache.get(codePoint);
    }

    for (const entry of entries) {
      if (
        entry.characterSet.has(
          codePoint
        )
      ) {
        cache.set(codePoint, entry);
        return entry;
      }
    }

    throw unsupportedCharacter(
      character,
      codePoint
    );
  };

  return {
    entries,
    resolve
  };
};

const segmentText = (
  text,
  resolveFont
) => {
  const runs = [];

  for (
    const character of
    normalizePdfText(text)
  ) {
    const entry =
      resolveFont(character);
    const current =
      runs.at(-1);

    if (
      current?.entry === entry
    ) {
      current.text += character;
    } else {
      runs.push({
        entry,
        text: character
      });
    }
  }

  return runs;
};

const drawUnicodeText = (
  page,
  text,
  {
    x,
    y,
    size,
    resolveFont
  }
) => {
  let cursorX = x;

  for (
    const run of
    segmentText(
      text,
      resolveFont
    )
  ) {
    page.drawText(
      run.text,
      {
        x: cursorX,
        y,
        size,
        font: run.entry.font,
        color: rgb(0, 0, 0)
      }
    );

    cursorX +=
      run.entry.font
        .widthOfTextAtSize(
          run.text,
          size
        );
  }

  return cursorX;
};

const wrap = (
  label,
  value,
  width = 88
) => {
  const prefix =
    label ? `${label}: ` : "";
  const text =
    `${prefix}${normalizePdfText(
      value
    )}`;
  const words =
    text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!word) continue;

    if (!current) {
      current = word;
      continue;
    }

    if (
      `${current} ${word}`.length <=
      width
    ) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length
    ? lines
    : [prefix.trimEnd()];
};

const quantityText = (goods) => {
  if (goods?.weight?.value) {
    return (
      `${goods.weight.value} ` +
      goods.weight.unit
    );
  }

  if (
    goods?.alternativeMeasure?.value
  ) {
    return (
      `${goods.alternativeMeasure.value} ` +
      goods.alternativeMeasure.unit
    );
  }

  return "";
};

const buildLines = (snapshot) => {
  const data = snapshot.data;
  const lines = [
    "Documento electrónico de Control Administrativo (DeCA)",
    "",
    ...wrap(
      "ID documento",
      snapshot.documentId
    ),
    ...wrap(
      "Versión",
      snapshot.version
    ),
    ...wrap(
      "Referencia externa",
      data.externalReference ?? ""
    ),
    ...wrap(
      "Creado",
      snapshot.createdAt
    ),
    ...wrap(
      "Modificado",
      snapshot.modifiedAt
    ),
    "",
    "Cargador contractual",
    ...wrap(
      "Razón social",
      data.contractualShipper
        .legalName
    ),
    ...wrap(
      "Identificador fiscal",
      data.contractualShipper.taxId
    ),
    ...wrap(
      "Dirección",
      data.contractualShipper
        .address
    ),
    "",
    "Transportista efectivo",
    ...wrap(
      "Razón social",
      data.effectiveCarrier
        .legalName
    ),
    ...wrap(
      "Identificador fiscal",
      data.effectiveCarrier.taxId
    ),
    "",
    "Servicio",
    ...wrap(
      "Origen",
      data.route.origin
    ),
    ...wrap(
      "Destino",
      data.route.destination
    ),
    ...wrap(
      "Mercancía",
      data.goods.nature
    ),
    ...wrap(
      "Cantidad",
      quantityText(data.goods)
    ),
    ...wrap(
      "Fecha transporte",
      data.transport.date
    ),
    ...wrap(
      "Matrícula tractora",
      data.transport.vehicle
        .tractorRegistration
    )
  ];

  if (
    data.transport.vehicle
      .trailerRegistration
  ) {
    lines.push(
      ...wrap(
        "Matrícula remolque/semirremolque",
        data.transport.vehicle
          .trailerRegistration
      )
    );
  }

  if (
    data.transport
      .specialTrafficAuthorization
  ) {
    lines.push(
      ...wrap(
        "Autorización especial",
        data.transport
          .specialTrafficAuthorization
      )
    );
  }

  if (data.observations) {
    lines.push(
      "",
      "Observaciones",
      ...wrap(
        "",
        data.observations
      )
    );
  }

  lines.push(
    "",
    ...wrap(
      "URL directa del documento",
      snapshot.accessUrl
    )
  );

  return lines;
};

const paginate = (
  lines,
  pageSize = LINES_PER_PAGE
) => {
  const pages = [];

  for (
    let index = 0;
    index < lines.length;
    index += pageSize
  ) {
    pages.push(
      lines.slice(
        index,
        index + pageSize
      )
    );
  }

  return pages.length
    ? pages
    : [[]];
};

const drawQr = (
  page,
  matrix,
  {
    x = 400,
    y = 50,
    size = 135,
    quietZone = 4
  } = {}
) => {
  const totalModules =
    matrix.length +
    quietZone * 2;
  const moduleSize =
    size / totalModules;

  for (
    let row = 0;
    row < matrix.length;
    row += 1
  ) {
    for (
      let column = 0;
      column < matrix.length;
      column += 1
    ) {
      if (
        !matrix[row][column]
      ) {
        continue;
      }

      page.drawRectangle({
        x:
          x +
          (
            column +
            quietZone
          ) *
            moduleSize,
        y:
          y +
          (
            totalModules -
            quietZone -
            row -
            1
          ) *
            moduleSize,
        width:
          moduleSize + 0.01,
        height:
          moduleSize + 0.01,
        color: rgb(0, 0, 0),
        borderWidth: 0
      });
    }
  }
};

const parsePdfDate = (
  value,
  name
) => {
  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new TypeError(
      `${name} is not a valid PDF timestamp`
    );
  }

  return date;
};

export async function renderNativeDecaPdf(
  snapshot,
  {
    maxBytes =
      MAX_DECA_PDF_BYTES
  } = {}
) {
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    snapshot.documentType !==
      "DECA" ||
    typeof snapshot.accessUrl !==
      "string" ||
    snapshot.data === null ||
    typeof snapshot.data !==
      "object"
  ) {
    throw new TypeError(
      "A valid DeCA document snapshot is required"
    );
  }

  const lines =
    buildLines(snapshot);
  const selectedSubsets =
    selectFontSubsets(
      lines.join("\n")
    );

  const pdfDoc =
    await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const { resolve } =
    await embedUnicodeFonts(
      pdfDoc,
      selectedSubsets
    );

  const qrMatrix =
    encodeQrMatrix(
      snapshot.accessUrl
    );
  const pageChunks =
    paginate(lines);

  pdfDoc.setTitle(
    `DeCA ${snapshot.documentId}`
  );
  pdfDoc.setSubject(
    "Documento electrónico de Control Administrativo"
  );
  pdfDoc.setProducer(
    "Puente DeCA"
  );
  pdfDoc.setCreator(
    "Puente DeCA"
  );
  pdfDoc.setCreationDate(
    parsePdfDate(
      snapshot.createdAt,
      "createdAt"
    )
  );
  pdfDoc.setModificationDate(
    parsePdfDate(
      snapshot.modifiedAt,
      "modifiedAt"
    )
  );

  pageChunks.forEach(
    (lines, pageIndex) => {
      const page =
        pdfDoc.addPage([
          PAGE_WIDTH,
          PAGE_HEIGHT
        ]);

      lines.forEach(
        (line, lineIndex) => {
          drawUnicodeText(
            page,
            line,
            {
              x: TEXT_X,
              y:
                TEXT_START_Y -
                lineIndex *
                  TEXT_LEADING,
              size: TEXT_SIZE,
              resolveFont: resolve
            }
          );
        }
      );

      if (pageIndex === 0) {
        drawQr(
          page,
          qrMatrix
        );
      }
    }
  );

  const bytes =
    await pdfDoc.save({
      useObjectStreams: false,
      addDefaultPage: false
    });
  const pdf =
    Buffer.from(bytes);

  if (
    pdf.length > maxBytes
  ) {
    const error = new Error(
      `Generated DeCA PDF exceeds maximum size of ${maxBytes} bytes`
    );
    error.code =
      "DECA_PDF_TOO_LARGE";
    error.size = pdf.length;
    error.maxBytes = maxBytes;
    throw error;
  }

  return pdf;
}
