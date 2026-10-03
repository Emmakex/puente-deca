import { encodeQrMatrix } from "./qr.mjs";

export const MAX_DECA_PDF_BYTES = 5_000_000;

const sanitizeLatin1 = (value) =>
  String(value ?? "")
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\xFF]/g, "?");

const escapePdfString = (value) =>
  sanitizeLatin1(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const pdfDate = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid PDF timestamp");
  }

  const iso = date.toISOString();
  return `D:${iso
    .slice(0, 19)
    .replace(/[-:T]/g, "")}Z`;
};

const wrap = (label, value, width = 88) => {
  const prefix = label ? `${label}: ` : "";
  const text = `${prefix}${sanitizeLatin1(value)}`;
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!word) continue;

    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [prefix.trimEnd()];
};

const quantityText = (goods) => {
  if (goods?.weight?.value) {
    return `${goods.weight.value} ${goods.weight.unit}`;
  }

  if (goods?.alternativeMeasure?.value) {
    return `${goods.alternativeMeasure.value} ${goods.alternativeMeasure.unit}`;
  }

  return "";
};

const buildLines = (snapshot) => {
  const data = snapshot.data;
  const lines = [
    "Documento electronico de Control Administrativo (DeCA)",
    "",
    ...wrap("ID documento", snapshot.documentId),
    ...wrap("Version", snapshot.version),
    ...wrap("Referencia externa", data.externalReference ?? ""),
    ...wrap("Creado", snapshot.createdAt),
    ...wrap("Modificado", snapshot.modifiedAt),
    "",
    "Cargador contractual",
    ...wrap("Razon social", data.contractualShipper.legalName),
    ...wrap("Identificador fiscal", data.contractualShipper.taxId),
    ...wrap("Direccion", data.contractualShipper.address),
    "",
    "Transportista efectivo",
    ...wrap("Razon social", data.effectiveCarrier.legalName),
    ...wrap("Identificador fiscal", data.effectiveCarrier.taxId),
    "",
    "Servicio",
    ...wrap("Origen", data.route.origin),
    ...wrap("Destino", data.route.destination),
    ...wrap("Mercancia", data.goods.nature),
    ...wrap("Cantidad", quantityText(data.goods)),
    ...wrap("Fecha transporte", data.transport.date),
    ...wrap(
      "Matricula tractora",
      data.transport.vehicle.tractorRegistration
    )
  ];

  if (data.transport.vehicle.trailerRegistration) {
    lines.push(
      ...wrap(
        "Matricula remolque/semirremolque",
        data.transport.vehicle.trailerRegistration
      )
    );
  }

  if (data.transport.specialTrafficAuthorization) {
    lines.push(
      ...wrap(
        "Autorizacion especial",
        data.transport.specialTrafficAuthorization
      )
    );
  }

  if (data.observations) {
    lines.push("", "Observaciones", ...wrap("", data.observations));
  }

  lines.push(
    "",
    ...wrap("URL directa del documento", snapshot.accessUrl)
  );

  return lines;
};

const formatNumber = (value) =>
  Number(value.toFixed(3)).toString();

const qrVectorStream = (
  matrix,
  {
    x = 400,
    y = 50,
    size = 135,
    quietZone = 4
  } = {}
) => {
  const totalModules = matrix.length + quietZone * 2;
  const moduleSize = size / totalModules;
  const commands = ["q", "0 g"];

  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix.length; column += 1) {
      if (!matrix[row][column]) continue;

      const drawX =
        x + (column + quietZone) * moduleSize;
      const drawY =
        y +
        (totalModules - quietZone - row - 1) *
          moduleSize;

      commands.push(
        [
          formatNumber(drawX),
          formatNumber(drawY),
          formatNumber(moduleSize + 0.01),
          formatNumber(moduleSize + 0.01),
          "re f"
        ].join(" ")
      );
    }
  }

  commands.push("Q");
  return commands.join("\n");
};

const textStream = (
  lines,
  { qrMatrix = null } = {}
) => {
  const commands = [
    "BT",
    "/F1 10 Tf",
    "50 790 Td",
    "14 TL"
  ];

  lines.forEach((line, index) => {
    if (index > 0) commands.push("T*");
    commands.push(`(${escapePdfString(line)}) Tj`);
  });

  commands.push("ET");

  if (qrMatrix) {
    commands.push(qrVectorStream(qrMatrix));
  }

  return commands.join("\n");
};

const objectBuffer = (id, body) =>
  Buffer.from(`${id} 0 obj\n${body}\nendobj\n`, "latin1");

const streamObjectBuffer = (id, stream) => {
  const data = Buffer.from(stream, "latin1");
  const head = Buffer.from(
    `${id} 0 obj\n<< /Length ${data.length} >>\nstream\n`,
    "latin1"
  );
  const tail = Buffer.from("\nendstream\nendobj\n", "latin1");
  return Buffer.concat([head, data, tail]);
};

const paginate = (lines, pageSize = 35) => {
  const pages = [];

  for (let index = 0; index < lines.length; index += pageSize) {
    pages.push(lines.slice(index, index + pageSize));
  }

  return pages.length ? pages : [[]];
};

export function renderNativeDecaPdf(
  snapshot,
  { maxBytes = MAX_DECA_PDF_BYTES } = {}
) {
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    snapshot.documentType !== "DECA" ||
    typeof snapshot.accessUrl !== "string" ||
    snapshot.data === null ||
    typeof snapshot.data !== "object"
  ) {
    throw new TypeError("A valid DeCA document snapshot is required");
  }

  const qrMatrix = encodeQrMatrix(snapshot.accessUrl);
  const pageChunks = paginate(buildLines(snapshot));
  const objects = new Map();

  objects.set(
    1,
    objectBuffer(1, "<< /Type /Catalog /Pages 2 0 R >>")
  );

  const pageRefs = pageChunks.map((_, index) => 5 + index * 2);
  objects.set(
    2,
    objectBuffer(
      2,
      `<< /Type /Pages /Kids [${pageRefs
        .map((id) => `${id} 0 R`)
        .join(" ")}] /Count ${pageRefs.length} >>`
    )
  );

  objects.set(
    3,
    objectBuffer(
      3,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    )
  );

  objects.set(
    4,
    objectBuffer(
      4,
      [
        "<<",
        `/Title (${escapePdfString(
          `DeCA ${snapshot.documentId}`
        )})`,
        "/Subject (Documento electronico de Control Administrativo)",
        "/Producer (Puente DeCA)",
        `/CreationDate (${pdfDate(snapshot.createdAt)})`,
        `/ModDate (${pdfDate(snapshot.modifiedAt)})`,
        ">>"
      ].join(" ")
    )
  );

  pageChunks.forEach((lines, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;

    objects.set(
      pageId,
      objectBuffer(
        pageId,
        [
          "<< /Type /Page",
          "/Parent 2 0 R",
          "/MediaBox [0 0 595 842]",
          "/Resources << /Font << /F1 3 0 R >> >>",
          `/Contents ${contentId} 0 R >>`
        ].join(" ")
      )
    );

    objects.set(
      contentId,
      streamObjectBuffer(
        contentId,
        textStream(lines, {
          qrMatrix: index === 0 ? qrMatrix : null
        })
      )
    );
  });

  const header = Buffer.from(
    "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n",
    "latin1"
  );
  const chunks = [header];
  const offsets = [0];
  let cursor = header.length;

  const maxObjectId = 4 + pageChunks.length * 2;

  for (let id = 1; id <= maxObjectId; id += 1) {
    const object = objects.get(id);
    offsets[id] = cursor;
    chunks.push(object);
    cursor += object.length;
  }

  const xrefOffset = cursor;
  const xrefLines = [
    "xref",
    `0 ${maxObjectId + 1}`,
    "0000000000 65535 f "
  ];

  for (let id = 1; id <= maxObjectId; id += 1) {
    xrefLines.push(
      `${String(offsets[id]).padStart(10, "0")} 00000 n `
    );
  }

  const trailer = Buffer.from(
    [
      ...xrefLines,
      "trailer",
      `<< /Size ${maxObjectId + 1} /Root 1 0 R /Info 4 0 R >>`,
      "startxref",
      String(xrefOffset),
      "%%EOF",
      ""
    ].join("\n"),
    "latin1"
  );

  const pdf = Buffer.concat([...chunks, trailer]);

  if (pdf.length > maxBytes) {
    const error = new Error(
      `Generated DeCA PDF exceeds maximum size of ${maxBytes} bytes`
    );
    error.code = "DECA_PDF_TOO_LARGE";
    error.size = pdf.length;
    error.maxBytes = maxBytes;
    throw error;
  }

  return pdf;
}
