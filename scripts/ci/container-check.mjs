import { readFile } from "node:fs/promises";

const [
  dockerfile,
  dockerignore,
  nvmrc
] = await Promise.all([
  readFile("Dockerfile", "utf8"),
  readFile(".dockerignore", "utf8"),
  readFile(".nvmrc", "utf8")
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

const nodeVersion = "22.23.3";

if (nvmrc.trim() !== nodeVersion) {
  throw new Error(
    "CI Node version must be pinned to 22.23.3"
  );
}

requirePattern(
  dockerfile,
  new RegExp(
    `^FROM node:${nodeVersion.replaceAll(".", "\\.")}-bookworm-slim AS dependencies$`,
    "m"
  ),
  "Container dependency stage must use the exact CI Node version"
);

requirePattern(
  dockerfile,
  new RegExp(
    `^FROM node:${nodeVersion.replaceAll(".", "\\.")}-bookworm-slim AS runtime$`,
    "m"
  ),
  "Container runtime stage must use the exact CI Node version"
);

requirePattern(
  dockerfile,
  /npm ci[\s\S]*--omit=dev[\s\S]*--ignore-scripts/,
  "Container dependencies must come from the committed lockfile without lifecycle scripts"
);

requirePattern(
  dockerfile,
  /COPY --from=dependencies --chown=node:node/,
  "Runtime node_modules must be copied with non-root ownership"
);

const dockerLines =
  new Set(
    dockerfile
      .split("\n")
      .map((line) => line.trim())
  );

for (const runtimePackage of [
  "packages/contracts",
  "packages/core",
  "packages/document-engine",
  "packages/ecmr-amendment",
  "packages/ecmr-signature",
  "packages/ecmr-xml",
  "packages/persistence"
]) {
  const copyLine =
    `COPY --chown=node:node ${runtimePackage} ./${runtimePackage}`;

  if (!dockerLines.has(copyLine)) {
    throw new Error(
      `Container runtime must include ${runtimePackage}`
    );
  }
}

requirePattern(
  dockerfile,
  /^USER node$/m,
  "Production container must run as the built-in non-root node user"
);

requirePattern(
  dockerfile,
  /HEALTHCHECK[\s\S]*\/ready/,
  "Container healthcheck must use dependency-aware /ready"
);

requirePattern(
  dockerfile,
  /CMD \["node", "apps\/api\/src\/main\.mjs"\]/,
  "Container must start the production API entrypoint directly"
);

if (
  /COPY\s+\.\s+\./.test(
    dockerfile
  )
) {
  throw new Error(
    "Container must not copy the full repository into the runtime image"
  );
}

if (
  /(?:KAIROSETH_SERVICE_SECRET|MONGODB_URI)\s*=\s*[^\s\\]+/.test(
    dockerfile
  )
) {
  throw new Error(
    "Container image must not bake production secrets"
  );
}

for (const requiredIgnore of [
  ".git",
  ".env",
  "node_modules",
  "apps/api/test",
  "packages/**/test"
]) {
  if (
    !dockerignore
      .split("\n")
      .includes(requiredIgnore)
  ) {
    throw new Error(
      `.dockerignore must exclude ${requiredIgnore}`
    );
  }
}

console.log(
  "Production container contract OK (exact Node, locked deps, minimal copy, required runtime packages, non-root runtime, /ready healthcheck, no baked secrets)"
);
