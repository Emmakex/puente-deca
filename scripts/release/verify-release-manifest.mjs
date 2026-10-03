import {
  createHash
} from "node:crypto";
import {
  readFile,
  stat
} from "node:fs/promises";

const manifestPath =
  process.argv[2] ??
  "dist/release-manifest.json";

const manifest = JSON.parse(
  await readFile(
    manifestPath,
    "utf8"
  )
);

const sha256 = (bytes) =>
  `sha256:${createHash("sha256")
    .update(bytes)
    .digest("hex")}`;

if (
  manifest.schemaVersion !== 1 ||
  manifest.productSlug !==
    "extensions/puente-deca" ||
  manifest.publicDocumentBase !==
    "https://kairoseth.com/deca"
) {
  throw new Error(
    "Release manifest identity is invalid"
  );
}

if (
  !/^[a-f0-9]{40}$/.test(
    manifest.source?.commit ?? ""
  )
) {
  throw new Error(
    "Release manifest commit is invalid"
  );
}

if (
  manifest.runtime?.node !==
    (
      await readFile(
        ".nvmrc",
        "utf8"
      )
    ).trim()
) {
  throw new Error(
    "Release manifest Node version does not match .nvmrc"
  );
}

for (
  const entry of
  manifest.artifacts ?? []
) {
  const [bytes, metadata] =
    await Promise.all([
      readFile(entry.path),
      stat(entry.path)
    ]);

  if (
    entry.bytes !== metadata.size ||
    entry.sha256 !==
      sha256(bytes)
  ) {
    throw new Error(
      `Release manifest mismatch for ${entry.path}`
    );
  }
}

const requiredPaths = new Set([
  "package.json",
  "package-lock.json",
  ".nvmrc",
  "Dockerfile",
  "docs/openapi.json",
  "dist/puente-deca-woocommerce-0.1.0.zip",
  "dist/puentedeca-prestashop-0.1.0.zip",
  "dist/SHA256SUMS",
  "dist/sbom.cdx.json"
]);

const actualPaths = new Set(
  manifest.artifacts.map(
    (entry) => entry.path
  )
);

for (const path of requiredPaths) {
  if (!actualPaths.has(path)) {
    throw new Error(
      `Release manifest is missing ${path}`
    );
  }
}

const serialized =
  JSON.stringify(manifest);

for (const secretName of [
  "MONGODB_URI",
  "KAIROSETH_SERVICE_SECRET",
  "OPERATIONS_HEALTH_SECRET"
]) {
  if (
    serialized.includes(secretName)
  ) {
    throw new Error(
      `Release manifest must not contain ${secretName}`
    );
  }
}

console.log(
  "Release manifest verified (identity, commit, runtime, artifact hashes, no secret fields)"
);
