#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${KAIROSETH_PUBLIC_URL:-https://kairoseth.com}"
OPERATIONS_SECRET="${OPERATIONS_HEALTH_SECRET:-}"
USER_AGENT="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

fail() {
  echo "FAIL KAIROSETH-BRIDGE-READINESS: $*" >&2
  exit 1
}

[ "${#OPERATIONS_SECRET}" -ge 32 ] || fail "operations health secret is missing or too short"
[[ "$BASE_URL" =~ ^https://kairoseth\.com/?$ ]] || fail "Kairoseth base URL must be canonical HTTPS"

result="$(mktemp)"
trap 'rm -f "$result"' EXIT

status="$(curl -4 --silent --show-error --get \
  --connect-timeout 8 --max-time 20 \
  --header "Authorization: Bearer $OPERATIONS_SECRET" \
  --header "Accept: application/json" \
  --header "User-Agent: $USER_AGENT" \
  --output "$result" --write-out '%{http_code}' \
  "${BASE_URL%/}/api/operations/deca/bridge-readiness")" \
  || fail "bridge readiness request failed at transport level"

RESULT_PATH="$result" HTTP_STATUS="$status" node <<'NODE'
const fs = require('node:fs');
const status = process.env.HTTP_STATUS ?? '';
const path = process.env.RESULT_PATH;
let body;
try {
  body = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch {
  console.error(`FAIL KAIROSETH-BRIDGE-READINESS: invalid JSON response HTTP=${status || 'n/a'}`);
  process.exit(1);
}

const check =
  typeof body?.check === 'string' && /^[a-z0-9_-]{1,128}$/i.test(body.check)
    ? body.check
    : 'unavailable';
const state =
  typeof body?.state === 'string' && /^[a-z0-9_-]{1,64}$/i.test(body.state)
    ? body.state
    : 'unavailable';

if (
  status === '200' &&
  body?.status === 'ok' &&
  check === 'kairoseth-cargo-bridge-readiness' &&
  state === 'ready' &&
  body?.configured === true &&
  body?.reachable === true
) {
  console.log('PASS KAIROSETH-BRIDGE-READINESS: Kairoseth → Puente DeCA bridge is configured and reachable.');
  process.exit(0);
}

if (
  status === '503' &&
  check === 'kairoseth-cargo-bridge-readiness' &&
  ['not-configured', 'unavailable', 'operations-secret-not-configured'].includes(state)
) {
  console.error(`FAIL KAIROSETH-BRIDGE-READINESS: state=${state} HTTP=503`);
  process.exit(1);
}

console.error(
  `FAIL KAIROSETH-BRIDGE-READINESS: unexpected sanitized response check=${check} state=${state} HTTP=${status || 'n/a'}`,
);
process.exit(1);
NODE
