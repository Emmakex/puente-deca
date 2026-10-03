import { readFile } from "node:fs/promises";

const smoke = await readFile(
  "scripts/production/kairoseth-health-smoke.mjs",
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
  /https:\/\/kairoseth\.com/,
  "Health smoke must default to canonical Kairoseth"
);
requirePattern(
  /\/api\/health\/puente-deca/,
  "Health smoke must target the protected Puente DeCA health route"
);
requirePattern(
  /OPERATIONS_HEALTH_SECRET/,
  "Health smoke must require the operations secret"
);
requirePattern(
  /authorization:[\s\S]*Bearer/,
  "Health smoke must authenticate with Bearer"
);
requirePattern(
  /redirect:\s*"manual"/,
  "Health smoke must reject redirect-based success"
);
requirePattern(
  /body\?\.engine !== "ready"/,
  "Health smoke must require engine=ready"
);

if (
  /process\.stdout\.write[\s\S]*secret/.test(
    smoke
  )
) {
  throw new Error(
    "Health smoke must not print the operations secret"
  );
}

console.log(
  "Kairoseth protected health smoke contract OK"
);
