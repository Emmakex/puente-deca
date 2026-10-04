import { readFile } from "node:fs/promises";

const server = await readFile(
  "apps/api/src/server.mjs",
  "utf8"
);
const metrics = await readFile(
  "apps/api/src/metrics.mjs",
  "utf8"
);
const mongo = await readFile(
  "packages/persistence/src/mongo-store.mjs",
  "utf8"
);
const gridfs = await readFile(
  "packages/persistence/src/gridfs-artifact-store.mjs",
  "utf8"
);

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requirePattern(
  server,
  /url\.pathname === "\/ready"/,
  "Readiness endpoint is missing"
);
requirePattern(
  server,
  /Promise\.allSettled/,
  "Readiness must probe dependencies without leaking thrown details"
);
requirePattern(
  server,
  /url\.pathname === "\/metrics"/,
  "Metrics endpoint is missing"
);
requirePattern(
  server,
  /ecmrVersionsMatch/,
  "eCMR immutable version endpoint is missing"
);
requirePattern(
  server,
  /"regulatory:read"/,
  "eCMR history reads must require regulatory:read"
);
requirePattern(
  server,
  /"regulatory:write"/,
  "eCMR history appends must require regulatory:write"
);
requirePattern(
  server,
  /expectedPreviousVersionId[\s\S]*ecmr_stale_head/,
  "eCMR append API must enforce optimistic accepted-head control"
);
requirePattern(
  server,
  /amendmentActorFromCredential/,
  "eCMR amendment actor must derive from authenticated credential context"
);
requirePattern(
  server,
  /verifyEcmrAmendmentChain/,
  "eCMR history reads must verify stored chain integrity"
);
requirePattern(
  server,
  /const normalizeEcmrXml[\s\S]{0,400}return value;/,
  "eCMR API must preserve the exact XML string rather than a normalized replacement"
);

requirePattern(
  server,
  /x-kairoseth-user-id/,
  "Kairoseth human actor context header is missing"
);
requirePattern(
  server,
  /kairoseth-user:\$\{humanUserId\}/,
  "Trusted Kairoseth human actor must be bound into amendment evidence"
);
requirePattern(
  server,
  /identityScheme:[\s\S]*"kairoseth-user"/,
  "Trusted Kairoseth human actor needs an explicit identity scheme"
);
requirePattern(
  server,
  /serviceUserId[\s\S]*secureSecretEqual|secureSecretEqual[\s\S]*actorUserId/,
  "Human actor context must remain inside the authenticated Kairoseth service boundary"
);

if (
  /payload\?\.actorId|payload\.actorId/.test(
    server
  )
) {
  throw new Error(
    "eCMR amendment API must not trust a client-supplied actorId"
  );
}

requirePattern(
  server,
  /secureSecretEqual[\s\S]*platformServiceSecret/,
  "Metrics must be protected by server-to-server authentication"
);
requirePattern(
  metrics,
  /puente_deca_requests_total/,
  "Global request counter is missing"
);
requirePattern(
  metrics,
  /puente_deca_responses_5xx_total/,
  "5xx response counter is missing"
);
requirePattern(
  metrics,
  /memory_rss_bytes/,
  "Memory gauge is missing"
);
requirePattern(
  mongo,
  /async probe\(\)[\s\S]*ping:\s*1/,
  "MongoDB readiness probe is missing"
);
requirePattern(
  gridfs,
  /async probe\(\)/,
  "GridFS readiness probe is missing"
);

if (
  /organizationId|shipmentId|credentialId/.test(
    metrics
  )
) {
  throw new Error(
    "Runtime metrics must not contain customer/domain labels"
  );
}

console.log(
  "Operations contract OK (liveness, dependency readiness, protected low-cardinality metrics)"
);
