import {
  mkdir,
  writeFile
} from "node:fs/promises";
import { dirname } from "node:path";
import {
  spawnSync
} from "node:child_process";

const outputPath =
  process.argv[2] ??
  "dist/sbom.cdx.json";

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

  return result.stdout;
};

const git = (...args) =>
  run("git", args).trim();

const commitSha =
  process.env.GITHUB_SHA?.trim() ||
  git("rev-parse", "HEAD");

const commitDate =
  git(
    "show",
    "-s",
    "--format=%cI",
    commitSha
  );

const raw = run(
  "npm",
  [
    "sbom",
    "--omit=dev",
    "--package-lock-only",
    "--sbom-format=cyclonedx",
    "--sbom-type=application"
  ]
);

const document = JSON.parse(raw);

delete document.serialNumber;

document.metadata ??= {};
document.metadata.timestamp =
  commitDate;

document.metadata.properties ??= [];

document.metadata.properties = [
  ...document.metadata.properties
    .filter(
      (entry) =>
        entry?.name !==
          "kairoseth:gitCommit" &&
        entry?.name !==
          "kairoseth:sourceDate"
    ),
  {
    name: "kairoseth:gitCommit",
    value: commitSha
  },
  {
    name: "kairoseth:sourceDate",
    value: commitDate
  }
].sort((left, right) =>
  String(left.name)
    .localeCompare(
      String(right.name)
    )
);

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
  `SBOM written to ${outputPath}\n`
);
