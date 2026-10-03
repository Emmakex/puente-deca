import { readFile } from "node:fs/promises";

const [
  sbom,
  manifest,
  verify,
  workflow
] = await Promise.all([
  readFile(
    "scripts/release/generate-sbom.mjs",
    "utf8"
  ),
  readFile(
    "scripts/release/create-release-manifest.mjs",
    "utf8"
  ),
  readFile(
    "scripts/release/verify-release-manifest.mjs",
    "utf8"
  ),
  readFile(
    ".github/workflows/release-candidate.yml",
    "utf8"
  )
]);

const requirePattern = (
  source,
  pattern,
  message
) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requirePattern(
  sbom,
  /npm[\s\S]*sbom/,
  "SBOM generator must use npm sbom"
);
requirePattern(
  sbom,
  /--sbom-format=cyclonedx/,
  "SBOM must use CycloneDX"
);
requirePattern(
  sbom,
  /delete document\.serialNumber/,
  "SBOM generator must remove random serial numbers"
);
requirePattern(
  sbom,
  /metadata\.timestamp[\s\S]*commitDate/,
  "SBOM timestamp must be normalized to the source commit"
);
requirePattern(
  manifest,
  /package-lock\.json/,
  "Release manifest must hash the dependency lockfile"
);
requirePattern(
  manifest,
  /docs\/openapi\.json/,
  "Release manifest must hash the OpenAPI contract"
);
requirePattern(
  manifest,
  /Dockerfile/,
  "Release manifest must hash the production container recipe"
);
requirePattern(
  manifest,
  /sbom\.cdx\.json/,
  "Release manifest must hash the SBOM"
);
requirePattern(
  verify,
  /Release manifest mismatch/,
  "Release verification must recalculate artifact hashes"
);
requirePattern(
  workflow,
  /npm ci --ignore-scripts/,
  "Release candidate workflow must install the committed lockfile"
);
requirePattern(
  workflow,
  /npm run contract:kairoseth/,
  "Release candidate workflow must run the Kairoseth E2E contract"
);
requirePattern(
  workflow,
  /npm run release:verify/,
  "Release candidate workflow must verify the manifest"
);
requirePattern(
  workflow,
  /dist\/release-manifest\.json/,
  "Release candidate evidence must include the manifest"
);
requirePattern(
  workflow,
  /dist\/sbom\.cdx\.json/,
  "Release candidate evidence must include the SBOM"
);

for (const source of [
  sbom,
  manifest,
  verify
]) {
  if (
    /MONGODB_URI|KAIROSETH_SERVICE_SECRET|OPERATIONS_HEALTH_SECRET/.test(
      source
    ) &&
    source !== verify
  ) {
    throw new Error(
      "Release generators must not inspect production secrets"
    );
  }
}

console.log(
  "Release evidence contract OK (deterministic SBOM, hashed manifest, independent verification, uploaded RC evidence)"
);
