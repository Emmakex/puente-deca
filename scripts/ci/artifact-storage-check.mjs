import { readFile } from "node:fs/promises";

const gridfs = await readFile(
  "packages/persistence/src/gridfs-artifact-store.mjs",
  "utf8"
);
const factory = await readFile(
  "packages/persistence/src/artifact-store-factory.mjs",
  "utf8"
);
const main = await readFile(
  "apps/api/src/main.mjs",
  "utf8"
);

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requirePattern(
  gridfs,
  /GridFSBucket/,
  "GridFS artifact store must use MongoDB GridFSBucket"
);
requirePattern(
  gridfs,
  /bucketName:\s*this\.#[a-zA-Z]+|new GridFSBucket/,
  "GridFS bucket configuration is missing"
);
requirePattern(
  gridfs,
  /deca_pdf/,
  "GridFS bucket must remain namespaced for DeCA"
);
requirePattern(
  gridfs,
  /filename:\s*1[\s\S]*unique:\s*true/,
  "PDF storage keys must be unique"
);
requirePattern(
  gridfs,
  /5_000_000/,
  "GridFS store must enforce the DeCA PDF size ceiling"
);
requirePattern(
  gridfs,
  /sha256/,
  "GridFS artifact metadata must keep the PDF checksum"
);
requirePattern(
  factory,
  /Filesystem artifact storage is disabled in production/,
  "Production must fail closed instead of using local filesystem artifacts"
);
requirePattern(
  factory,
  /MONGODB_URI/,
  "GridFS production configuration must use MongoDB Atlas"
);
requirePattern(
  main,
  /openArtifactStore/,
  "Runtime must open artifacts through the artifact store factory"
);

if (/FileArtifactStore\.open/.test(main)) {
  throw new Error(
    "Runtime must not hard-code filesystem PDF storage"
  );
}

console.log(
  "Artifact storage contract OK (GridFS production, filesystem dev-only, checksum and size guards)"
);
