import {
  createHash
} from "node:crypto";
import {
  readFile,
  stat,
  mkdir,
  writeFile
} from "node:fs/promises";
import { dirname } from "node:path";
import {
  spawnSync
} from "node:child_process";

const outputPath =
  process.argv[2] ??
  "dist/release-manifest.json";

const requiredFiles = [
  "package.json",
  "package-lock.json",
  ".nvmrc",
  "Dockerfile",
  "docs/openapi.json",
  "dist/puente-deca-woocommerce-0.1.0.zip",
  "dist/puentedeca-prestashop-0.1.0.zip",
  "dist/SHA256SUMS",
  "dist/sbom.cdx.json"
];

const run = (
  command,
  args
) => {
  const result = spawnSync(
    command,
    args,
    {
      encoding: "utf8",
      env: process.env
    }
  );

  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed`,
        result.stderr
      ].join("\n")
    );
  }

  return result.stdout.trim();
};

const git = (...args) =>
  run("git", args);

const sha256 = (bytes) =>
  `sha256:${createHash("sha256")
    .update(bytes)
    .digest("hex")}`;

const fileEntry = async (path) => {
  const [bytes, metadata] =
    await Promise.all([
      readFile(path),
      stat(path)
    ]);

  return {
    path,
    bytes: metadata.size,
    sha256: sha256(bytes)
  };
};

const packageJson = JSON.parse(
  await readFile(
    "package.json",
    "utf8"
  )
);

const commit =
  process.env.GITHUB_SHA?.trim() ||
  git("rev-parse", "HEAD");

const commitDate =
  git(
    "show",
    "-s",
    "--format=%cI",
    commit
  );

const files = await Promise.all(
  requiredFiles.map(fileEntry)
);

const dependencies =
  Object.fromEntries(
    Object.entries(
      packageJson.dependencies ?? {}
    ).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );

const document = {
  schemaVersion: 1,
  product:
    "Kairoseth Puente DeCA",
  productSlug:
    "extensions/puente-deca",
  version:
    packageJson.version,
  source: {
    repository:
      "Emmakex/puente-deca",
    commit,
    commitDate
  },
  runtime: {
    node:
      (
        await readFile(
          ".nvmrc",
          "utf8"
        )
      ).trim(),
    packageManager:
      packageJson.packageManager
  },
  publicDocumentBase:
    "https://kairoseth.com/deca",
  dependencies,
  artifacts:
    files.sort((left, right) =>
      left.path.localeCompare(
        right.path
      )
    )
};

await mkdir(
  dirname(outputPath),
  { recursive: true }
);

await writeFile(
  outputPath,
  `${JSON.stringify(
    document,
    null,
    2
  )}\n`,
  "utf8"
);

process.stdout.write(
  `Release manifest written to ${outputPath}\n`
);
