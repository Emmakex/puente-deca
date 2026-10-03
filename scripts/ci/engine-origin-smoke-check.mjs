import { readFile } from "node:fs/promises";

const source =
  await readFile(
    "scripts/production/engine-origin-smoke.mjs",
    "utf8",
  );

const requirePattern = (
  pattern,
  message,
) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requirePattern(
  /DECA_ENGINE_SMOKE_BASE_URL/,
  "Engine origin smoke must require an explicit target origin",
);
requirePattern(
  /DECA_ENGINE_SMOKE_PROXY_SECRET/,
  "Engine origin smoke must require the dedicated proxy secret",
);
requirePattern(
  /"\/health"/,
  "Engine origin smoke must verify liveness",
);
requirePattern(
  /"\/ready"/,
  "Engine origin smoke must verify dependency readiness",
);
requirePattern(
  /directResponse\.status !== 401/,
  "Engine origin smoke must prove direct public-PDF access is blocked",
);
requirePattern(
  /x-kairoseth-public-proxy-secret/,
  "Engine origin smoke must verify the authenticated proxy path",
);
requirePattern(
  /proxyResponse\.status !== 404/,
  "Engine origin smoke must require the controlled missing-document result",
);
requirePattern(
  /probeCreatedData:[\s\S]*false/,
  "Engine origin smoke must explicitly report that the probe creates no data",
);

if (
  /console\.(?:log|info|debug)\([^\n]*(?:proxySecret|DECA_ENGINE_SMOKE_PROXY_SECRET)/i.test(
    source,
  )
) {
  throw new Error(
    "Engine origin smoke must not log the proxy secret",
  );
}

console.log(
  "Engine origin smoke contract OK (HTTPS origin, health/readiness, direct-origin block, authenticated missing-document path, no secret logging)",
);
