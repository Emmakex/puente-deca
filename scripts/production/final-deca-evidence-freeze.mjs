import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const sha256 = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const fail = (message) => {
  throw new Error(`DECA_FINAL_FREEZE_INVALID: ${message}`);
};

const gitHead = () => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (result.status !== 0) fail("git HEAD could not be resolved");
  return result.stdout.trim();
};

export const validateFinalFreezeInputs = ({
  releaseManifest,
  infrastructureAcceptance,
  currentCommit,
}) => {
  if (!releaseManifest || typeof releaseManifest !== "object") {
    fail("release manifest is invalid");
  }
  if (releaseManifest.schemaVersion !== 1) fail("release schemaVersion must be 1");
  if (releaseManifest.productSlug !== "extensions/puente-deca") {
    fail("release productSlug must be extensions/puente-deca");
  }
  if (releaseManifest.source?.repository !== "Emmakex/puente-deca") {
    fail("release repository must be Emmakex/puente-deca");
  }
  if (releaseManifest.source?.commit !== currentCommit) {
    fail("release manifest commit must equal current git HEAD");
  }

  const artifactPaths = new Set(
    Array.isArray(releaseManifest.artifacts)
      ? releaseManifest.artifacts.map((entry) => entry?.path)
      : [],
  );
  for (const required of [
    "dist/puente-deca-woocommerce-0.1.0.zip",
    "dist/puentedeca-prestashop-0.1.0.zip",
    "dist/SHA256SUMS",
    "dist/sbom.cdx.json",
  ]) {
    if (!artifactPaths.has(required)) fail(`release artifact missing: ${required}`);
  }

  if (!infrastructureAcceptance || typeof infrastructureAcceptance !== "object") {
    fail("infrastructure acceptance is invalid");
  }
  if (infrastructureAcceptance.schemaVersion !== 1) {
    fail("infrastructure schemaVersion must be 1");
  }
  if (infrastructureAcceptance.milestone !== "deca-100") {
    fail("infrastructure milestone must be deca-100");
  }
  if (infrastructureAcceptance.allRequiredGatesPassed !== true) {
    fail("all required infrastructure gates must have passed");
  }
  if (!infrastructureAcceptance.gates || Object.keys(infrastructureAcceptance.gates).length !== 8) {
    fail("infrastructure acceptance must contain exactly eight gates");
  }
  for (const [name, gate] of Object.entries(infrastructureAcceptance.gates)) {
    if (gate?.status !== "pass") fail(`${name} must be pass`);
    if (!/^sha256:[a-f0-9]{64}$/.test(gate?.evidenceSha256 ?? "")) {
      fail(`${name} evidence hash is invalid`);
    }
  }

  return true;
};

const runCli = async () => {
  const releasePath = process.argv[2] || process.env.DECA_RELEASE_MANIFEST;
  const infraPath = process.argv[3] || process.env.DECA_FINAL_INFRA_EVIDENCE;
  const outputPath = process.argv[4] || process.env.DECA_FINAL_FREEZE_OUTPUT;
  if (!releasePath || !infraPath || !outputPath) {
    fail("release manifest, infrastructure evidence and output paths are required");
  }

  const [releaseBytes, infraBytes] = await Promise.all([
    readFile(resolve(releasePath)),
    readFile(resolve(infraPath)),
  ]);
  const releaseManifest = JSON.parse(releaseBytes.toString("utf8"));
  const infrastructureAcceptance = JSON.parse(infraBytes.toString("utf8"));
  const currentCommit = gitHead();

  validateFinalFreezeInputs({
    releaseManifest,
    infrastructureAcceptance,
    currentCommit,
  });

  const frozenAt = new Date().toISOString();
  const evidence = {
    schemaVersion: 1,
    milestone: "deca-100-final-freeze",
    product: "Kairoseth Cargo",
    productSlug: "extensions/puente-deca",
    repository: "Emmakex/puente-deca",
    commit: currentCommit,
    version: releaseManifest.version,
    frozenAt,
    releaseManifestSha256: sha256(releaseBytes),
    infrastructureAcceptanceSha256: sha256(infraBytes),
    allRequiredGatesPassed: true,
  };

  await writeFile(
    resolve(outputPath),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
};

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invoked && import.meta.url === invoked) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
