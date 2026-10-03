import { readFile } from "node:fs/promises";

const smoke = await readFile(
  "scripts/production/public-pdf-smoke.mjs",
  "utf8"
);

const requirePattern = (
  pattern,
  message
) => {
  if (!pattern.test(smoke)) {
    throw new Error(message);
  }
};

requirePattern(
  /https:/,
  "Public smoke must require HTTPS"
);
requirePattern(
  /hostname !== "kairoseth\.com"/,
  "Public smoke must pin kairoseth.com"
);
requirePattern(
  /\/deca\\\/d\\\//,
  "Public smoke must validate the canonical DeCA path"
);
requirePattern(
  /redirect:\s*"manual"/,
  "Public smoke must reject redirect-based success"
);
requirePattern(
  /application\/pdf/,
  "Public smoke must require PDF content"
);
requirePattern(
  /5_000_000/,
  "Public smoke must enforce the DeCA size ceiling"
);
requirePattern(
  /%PDF-/,
  "Public smoke must check the PDF signature"
);
requirePattern(
  /PUBLIC_PDF_SHA256_MISMATCH/,
  "Public smoke must verify SHA-256"
);
requirePattern(
  /no-store/i,
  "Public smoke must validate no-store"
);
requirePattern(
  /nosniff/i,
  "Public smoke must validate nosniff"
);
requirePattern(
  /no-referrer/i,
  "Public smoke must validate no-referrer"
);
requirePattern(
  /noindex/i,
  "Public smoke must validate noindex"
);

if (
  /KAIROSETH_SERVICE_SECRET|MONGODB_URI/.test(
    smoke
  )
) {
  throw new Error(
    "Public PDF smoke must remain credential-free"
  );
}

console.log(
  "Public PDF smoke contract OK (canonical Kairoseth URL, direct PDF, size, integrity and privacy headers)"
);
