import "regenerator-runtime/runtime.js";
import { readFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  rgb
} from "pdf-lib";

export const MAX_ECMR_REVIEW_PDF_BYTES =
  5_000_000;

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const TEXT_X = 48;
const TEXT_START_Y = 792;
const TEXT_SIZE = 9.5;
const TEXT_LEADING = 13;
const LINES_PER_PAGE = 50;

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

const text = (
  value
) =>
  String(value ?? "")
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .trim();

const fontPath = (
  subset
) =>
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
      `Unknown eCMR font subset: ${subset}`
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
      .padStart(4, "0")} is not supported by the embedded eCMR font set`
  );
  error.code =
    "ECMR_PDF_UNSUPPORTED_CHARACTER";
  error.character =
    character;
  error.codePoint =
    codePoint;
  return error;
};

const selectFontSubsets = (
  value
) => {
  const normalized =
    text(value);
  const selected =
    new Set(["latin"]);

  if (
    /[\u0100-\u02AF\u1D00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF]/u.test(
      normalized
    )
  ) {
    selected.add(
      "latin-ext"
    );
  }

  if (
    /[\u0102\u0103\u0110\u0111\u0128\u0129\u0168\u0169\u01A0\u01A1\u01AF\u01B0\u1EA0-\u1EF9\u20AB]/u.test(
      normalized
    )
  ) {
    selected.add(
      "vietnamese"
    );
  }

  if (
    /\p{Script=Greek}/u.test(
      normalized
    )
  ) {
    selected.add("greek");
  }

  if (
    /[\u1F00-\u1FFF]/u.test(
      normalized
    )
  ) {
    selected.add(
      "greek-ext"
    );
  }

  if (
    /\p{Script=Cyrillic}/u.test(
      normalized
    )
  ) {
    selected.add(
      "cyrillic"
    );
  }

  if (
    /[\u0500-\u052F\u1C80-\u1C8F\u2DE0-\u2DFF\uA640-\uA69F]/u.test(
      normalized
    )
  ) {
    selected.add(
      "cyrillic-ext"
    );
  }

  if (
    /\p{Script=Devanagari}/u.test(
      normalized
    )
  ) {
    selected.add(
      "devanagari"
    );
  }

  return FONT_SUBSETS.filter(
    (subset) =>
      selected.has(subset)
  );
};

const embedFonts = async (
  pdfDoc,
  subsets
) => {
  const sources =
    await Promise.all(
      subsets.map(
        loadFontSource
      )
    );
  const entries = [];

  for (
    const source of
    sources
  ) {
    const font =
      await pdfDoc.embedFont(
        source.bytes,
        {
          subset: false,
          customName:
            `NotoSans-eCMR-${source.subset}`
        }
      );

    entries.push({
      font,
      characterSet:
        new Set(
          font
            .getCharacterSet()
        )
    });
  }

  const cache =
    new Map();

  const resolve = (
    character
  ) => {
    const codePoint =
      character
        .codePointAt(0);

    if (
      cache.has(
        codePoint
      )
    ) {
      return cache.get(
        codePoint
      );
    }

    for (
      const entry of
      entries
    ) {
      if (
        entry.characterSet
          .has(
            codePoint
          )
      ) {
        cache.set(
          codePoint,
          entry
        );
        return entry;
      }
    }

    throw unsupportedCharacter(
      character,
      codePoint
    );
  };

  return resolve;
};

const drawText = (
  page,
  value,
  {
    x,
    y,
    size,
    resolveFont
  }
) => {
  let cursorX = x;
  let currentEntry =
    null;
  let run = "";

  const flush = () => {
    if (
      !currentEntry ||
      run.length === 0
    ) {
      return;
    }

    page.drawText(
      run,
      {
        x: cursorX,
        y,
        size,
        font:
          currentEntry.font,
        color:
          rgb(0, 0, 0)
      }
    );

    cursorX +=
      currentEntry.font
        .widthOfTextAtSize(
          run,
          size
        );
    run = "";
  };

  for (
    const character of
    text(value)
  ) {
    const entry =
      resolveFont(
        character
      );

    if (
      currentEntry === entry
    ) {
      run +=
        character;
      continue;
    }

    flush();
    currentEntry =
      entry;
    run =
      character;
  }

  flush();
};

const wrap = (
  label,
  value,
  width = 86
) => {
  const prefix =
    label
      ? `${label}: `
      : "";
  const full =
    `${prefix}${text(value)}`;
  const words =
    full.split(/\s+/);
  const lines = [];
  let current = "";

  for (
    const word of
    words
  ) {
    if (!word) {
      continue;
    }

    if (!current) {
      current = word;
      continue;
    }

    if (
      `${current} ${word}`
        .length <=
      width
    ) {
      current +=
        ` ${word}`;
    } else {
      lines.push(
        current
      );
      current =
        word;
    }
  }

  if (current) {
    lines.push(
      current
    );
  }

  return lines.length
    ? lines
    : [prefix.trimEnd()];
};

const quantityText = (
  quantity
) => {
  if (
    quantity === null ||
    quantity === undefined
  ) {
    return "";
  }

  if (
    typeof quantity ===
      "object" &&
    quantity !== null
  ) {
    return [
      quantity.value,
      quantity.unit
    ]
      .filter(
        (entry) =>
          entry !==
            null &&
          entry !==
            undefined &&
          entry !== ""
      )
      .join(" ");
  }

  return text(quantity);
};

const buildLines = ({
  shipmentId,
  version,
  schemaConformance
}) => {
  const review =
    version.reviewSnapshot ??
    {};
  const goods =
    review.goods ??
    {};
  const packages =
    goods.packages ??
    {};
  const dangerous =
    goods.dangerousGoods ??
    {};
  const charges =
    review.charges ??
    {};
  const customs =
    review.customsFormalities ??
    {};
  const convention =
    review.conventionApplicability ??
    {};

  const lines = [
    "eCMR — Verifiable human review",
    "NOT ISSUED / NOT SIGNED",
    "Human-readable projection of the immutable eCMR version. This PDF is not issuance evidence.",
    "",
    ...wrap(
      "Shipment",
      shipmentId
    ),
    ...wrap(
      "External reference",
      review.externalReference
    ),
    ...wrap(
      "Version",
      version.version
    ),
    ...wrap(
      "Version ID",
      version.versionId
    ),
    ...wrap(
      "Created",
      version.createdAt
    ),
    ...wrap(
      "Actor",
      version.actor?.actorId
    ),
    ...wrap(
      "Party role",
      version.actor?.partyRole
    ),
    ...wrap(
      "Change reason",
      version.reason
    ),
    ...wrap(
      "Immutable XML SHA-256",
      version.contentHash
    ),
    ...wrap(
      "Human-review SHA-256",
      version.reviewHash
    ),
    ...wrap(
      "UN/CEFACT release",
      review.messageRelease
    ),
    ...wrap(
      "Schema status",
      schemaConformance
    ),
    "",
    "Parties",
    ...wrap(
      "Sender",
      review.sender?.legalName
    ),
    ...wrap(
      "Sender address",
      review.sender?.address
    ),
    ...wrap(
      "Contractual carrier",
      review.contractualCarrier
        ?.legalName
    ),
    ...wrap(
      "Carrier address",
      review.contractualCarrier
        ?.address
    ),
    ...wrap(
      "Consignee",
      review.consignee?.legalName
    ),
    ...wrap(
      "Consignee address",
      review.consignee?.address
    ),
    "",
    "Carriage",
    ...wrap(
      "Issue",
      [
        review.issue?.date,
        review.issue?.place
      ].filter(Boolean).join(" — ")
    ),
    ...wrap(
      "Taking over",
      [
        review.takingOver?.date,
        review.takingOver?.place
      ].filter(Boolean).join(" — ")
    ),
    ...wrap(
      "Delivery place",
      review.delivery?.place
    ),
    "",
    "Goods",
    ...wrap(
      "Nature",
      goods.nature
    ),
    ...wrap(
      "Quantity",
      quantityText(
        goods.quantity
      )
    ),
    ...wrap(
      "Packing method",
      goods.packingMethod
    ),
    ...wrap(
      "Packing code",
      goods.packingMethodCode
    ),
    ...wrap(
      "Packages",
      packages.count
    ),
    ...wrap(
      "Marks / numbers",
      Array.isArray(
        packages.marksAndNumbers
      )
        ? packages.marksAndNumbers
            .join(", ")
        : ""
    )
  ];

  if (
    dangerous.declared ===
      true
  ) {
    lines.push(
      ...wrap(
        "Dangerous goods UN",
        dangerous
          .undgIdentificationCode
      ),
      ...wrap(
        "Proper shipping name",
        dangerous
          .properShippingName
      ),
      ...wrap(
        "Technical name",
        dangerous
          .technicalName
      ),
      ...wrap(
        "Regulation",
        dangerous
          .regulationCode
      ),
      ...wrap(
        "Hazard class",
        dangerous
          .hazardClassificationId
      ),
      ...wrap(
        "Packaging danger level",
        dangerous
          .packagingDangerLevelCode
      )
    );
  }

  lines.push(
    "",
    "Charges"
  );

  if (
    charges.declared ===
      true &&
    Array.isArray(
      charges.items
    ) &&
    charges.items.length > 0
  ) {
    charges.items.forEach(
      (
        charge,
        index
      ) => {
        lines.push(
          ...wrap(
            `Charge ${index + 1}`,
            [
              charge.description,
              quantityText(
                charge.amount
              ),
              charge
                .chargeCategoryCode
            ]
              .filter(Boolean)
              .join(" — ")
          )
        );
      }
    );
  } else {
    lines.push(
      "No declared carriage charges"
    );
  }

  lines.push(
    "",
    "Customs / formalities"
  );

  if (
    customs.declared ===
      true &&
    Array.isArray(
      customs.instructions
    ) &&
    customs.instructions
      .length > 0
  ) {
    customs.instructions
      .forEach(
        (
          instruction,
          index
        ) => {
          lines.push(
            ...wrap(
              `Instruction ${index + 1}`,
              instruction
            )
          );
        }
      );
  } else {
    lines.push(
      "No declared customs/formality instructions"
    );
  }

  lines.push(
    "",
    "CMR applicability",
    ...wrap(
      "Declared",
      convention.declared ===
        true
        ? "yes"
        : "no"
    ),
    ...wrap(
      "Statement",
      convention.statement
    ),
    "",
    "Electronic status",
    ...wrap(
      "Authentication",
      review.authentication
        ?.state
    ),
    ...wrap(
      "Integrity",
      review.integrity
        ?.state
    ),
    "",
    "Issuance gate",
    "This review remains NOT ISSUED until official D25A XSD acceptance and production signer identity policy are satisfied."
  );

  return lines;
};

export async function renderVerifiedEcmrReviewPdf(
  {
    shipmentId,
    version,
    schemaConformance
  },
  {
    maxBytes =
      MAX_ECMR_REVIEW_PDF_BYTES
  } = {}
) {
  if (
    typeof shipmentId !==
      "string" ||
    shipmentId.length === 0 ||
    version === null ||
    typeof version !==
      "object" ||
    version.reviewSnapshot ===
      null ||
    typeof version.reviewSnapshot !==
      "object" ||
    typeof version.reviewHash !==
      "string"
  ) {
    const error =
      new TypeError(
        "Verified eCMR review evidence is required"
      );
    error.code =
      "ECMR_REVIEW_PDF_INPUT_INVALID";
    throw error;
  }

  const lines =
    buildLines({
      shipmentId,
      version,
      schemaConformance
    });
  const combined =
    lines.join("\n");
  const pdfDoc =
    await PDFDocument.create();

  pdfDoc.registerFontkit(
    fontkit
  );

  const resolveFont =
    await embedFonts(
      pdfDoc,
      selectFontSubsets(
        combined
      )
    );

  const createdAt =
    new Date(
      version.createdAt
    );

  if (
    !Number.isNaN(
      createdAt.getTime()
    )
  ) {
    pdfDoc.setCreationDate(
      createdAt
    );
    pdfDoc.setModificationDate(
      createdAt
    );
  }

  pdfDoc.setTitle(
    `eCMR review ${version.versionId}`
  );
  pdfDoc.setSubject(
    "Verifiable human review of eCMR — NOT ISSUED"
  );
  pdfDoc.setProducer(
    "Puente DeCA"
  );
  pdfDoc.setCreator(
    "Puente DeCA"
  );
  pdfDoc.setKeywords([
    "eCMR",
    "CMR",
    "UN/CEFACT",
    "human review",
    "not issued"
  ]);

  for (
    let offset = 0;
    offset < lines.length;
    offset +=
      LINES_PER_PAGE
  ) {
    const page =
      pdfDoc.addPage([
        PAGE_WIDTH,
        PAGE_HEIGHT
      ]);
    const pageLines =
      lines.slice(
        offset,
        offset +
          LINES_PER_PAGE
      );
    let y =
      TEXT_START_Y;

    for (
      const line of
      pageLines
    ) {
      drawText(
        page,
        line,
        {
          x:
            TEXT_X,
          y,
          size:
            TEXT_SIZE,
          resolveFont
        }
      );
      y -=
        TEXT_LEADING;
    }
  }

  const bytes =
    Buffer.from(
      await pdfDoc.save({
        useObjectStreams:
          false
      })
    );

  if (
    bytes.length >
      maxBytes
  ) {
    const error =
      new Error(
        "eCMR review PDF exceeds the configured byte ceiling"
      );
    error.code =
      "ECMR_REVIEW_PDF_TOO_LARGE";
    error.size =
      bytes.length;
    error.maxBytes =
      maxBytes;
    throw error;
  }

  return bytes;
}
