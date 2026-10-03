import { readFile } from "node:fs/promises";

const server = await readFile(
  "apps/api/src/server.mjs",
  "utf8"
);
const limiter = await readFile(
  "apps/api/src/rate-limit.mjs",
  "utf8"
);

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requirePattern(
  limiter,
  /maxRequests\s*=\s*600/,
  "Authenticated rate limit needs a bounded default"
);
requirePattern(
  limiter,
  /maxEntries\s*=\s*10_000/,
  "Rate-limit state must have a memory bound"
);
requirePattern(
  limiter,
  /resetAt/,
  "Rate limiter must expose a retry window"
);
requirePattern(
  server,
  /error:\s*"rate_limited"/,
  "Server must emit a stable 429 error code"
);
requirePattern(
  server,
  /retry-after/,
  "Rate-limited responses must include Retry-After"
);
requirePattern(
  server,
  /platform:\$\{credential\.organizationId\}/,
  "Kairoseth service requests must be isolated by organization"
);
requirePattern(
  server,
  /connector:\$\{credential\.credentialId\}/,
  "Connector requests must be isolated by credential"
);
requirePattern(
  server,
  /RATE_LIMIT_WINDOW_MS/,
  "Rate-limit window must be configurable"
);
requirePattern(
  server,
  /RATE_LIMIT_MAX_REQUESTS/,
  "Rate-limit maximum must be configurable"
);

if (/x-forwarded-for|remoteAddress/.test(server + limiter)) {
  throw new Error(
    "Engine authenticated rate limiting must not depend on proxy/IP identity"
  );
}

console.log(
  "Authenticated rate-limit contract OK (organization/credential isolation, 429 Retry-After, bounded memory)"
);
