#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${OPERATIONS_HEALTH_SECRET:?OPERATIONS_HEALTH_SECRET is required}"
if [ "${#OPERATIONS_HEALTH_SECRET}" -lt 32 ]; then
  echo "FAIL KAIROSETH-CARGO-EDGE: OPERATIONS_HEALTH_SECRET is missing or invalid"
  exit 1
fi

base="${PUBLIC_PRODUCTION_URL:-https://kairoseth.com}"
fixture_endpoint="$base/api/operations/deca/acceptance-fixture"
health_endpoint="$base/api/health"
evidence_dir="${KAIROSETH_CARGO_EDGE_EVIDENCE_DIR:-.artifacts/kairoseth-cargo-edge}"
user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
work="${RUNNER_TEMP:-/tmp}/deca-current-deploy-edge-${GITHUB_RUN_ID:-local}"
mkdir -p "$work" "$evidence_dir"
chmod 700 "$work" "$evidence_dir"

credential_id=""
revoked=0

revoke_credential() {
  if [ "$revoked" -eq 1 ] || [ -z "$credential_id" ]; then
    return 0
  fi
  local body="$work/revoke.json"
  local status=""
  status="$(curl -4 --silent --show-error --request DELETE \
    --connect-timeout 8 --max-time 20 \
    --header "Authorization: Bearer $OPERATIONS_HEALTH_SECRET" \
    --header "x-kairoseth-acceptance-confirm: synthetic-production-credential-revoke" \
    --header "x-kairoseth-acceptance-credential-id: $credential_id" \
    --header "Accept: application/json" \
    --header "User-Agent: $user_agent" \
    --output "$body" --write-out '%{http_code}' \
    "$fixture_endpoint")" || return 1
  [ "$status" = "200" ] || return 1
  node -e '
    const fs = require("node:fs");
    const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.exit(body?.status === "ok" && body?.revoked === true ? 0 : 1);
  ' "$body" || return 1
  revoked=1
}

cleanup() {
  revoke_credential >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

health_body="$work/health.json"
health_status=""
for attempt in 1 2 3 4; do
  set +e
  health_status="$(curl -4 --silent --show-error \
    --connect-timeout 8 --max-time 20 \
    --header "Accept: application/json" \
    --header "User-Agent: $user_agent" \
    --output "$health_body" --write-out '%{http_code}' \
    "$health_endpoint?edge_acceptance=${GITHUB_RUN_ID:-local}-${attempt}")"
  curl_status=$?
  set -e
  if [ "$curl_status" -eq 0 ] && [ "$health_status" = "200" ]; then
    break
  fi
  [ "$attempt" -eq 4 ] || sleep 2
done

if [ "$health_status" != "200" ]; then
  echo "FAIL KAIROSETH-CARGO-EDGE: public health is unavailable"
  exit 1
fi

DEPLOYED_REVISION="$(HEALTH_BODY="$health_body" node <<'NODE'
const fs = require('node:fs');
const body = JSON.parse(fs.readFileSync(process.env.HEALTH_BODY, 'utf8'));
const revision = body?.revision ?? '';
if (body?.status !== 'ok' || body?.service !== 'kairoseth-platform' || !/^[a-f0-9]{40}$/.test(revision)) process.exit(1);
process.stdout.write(revision);
NODE
)"
echo "Observed deployed Kairoseth revision: $DEPLOYED_REVISION"

fixture_body="$work/fixture.json"
fixture_status=""
for attempt in 1 2 3 4; do
  set +e
  fixture_status="$(curl -4 --silent --show-error --request POST \
    --connect-timeout 8 --max-time 25 \
    --header "Authorization: Bearer $OPERATIONS_HEALTH_SECRET" \
    --header "x-kairoseth-acceptance-confirm: synthetic-production-fixture" \
    --header "Accept: application/json" \
    --header "User-Agent: $user_agent" \
    --output "$fixture_body" --write-out '%{http_code}' \
    "$fixture_endpoint")"
  curl_status=$?
  set -e
  if [ "$curl_status" -eq 0 ] && [ "$fixture_status" = "200" ]; then
    break
  fi
  [ "$attempt" -eq 4 ] || sleep 2
done

if [ "$fixture_status" != "200" ]; then
  echo "FAIL KAIROSETH-CARGO-EDGE: synthetic fixture provisioning failed"
  exit 1
fi

FIXTURE_BODY="$fixture_body" WORK_DIR="$work" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const body = JSON.parse(fs.readFileSync(process.env.FIXTURE_BODY, 'utf8'));
const publicPdfUrl = body?.publicPdfUrl ?? '';
const credentialId = body?.credential?.credentialId ?? '';
const ok = body?.status === 'ok'
  && body?.check === 'kairoseth-cargo-acceptance-fixture'
  && body?.synthetic === true
  && body?.customerData === false
  && body?.organizationId === 'kairoseth-cargo-production-acceptance'
  && /^https:\/\/kairoseth\.com\/deca\/d\/[A-Za-z0-9_-]{16,128}\.pdf$/.test(publicPdfUrl)
  && /^[A-Za-z0-9_-]{8,160}$/.test(credentialId);
if (!ok) process.exit(1);
fs.writeFileSync(path.join(process.env.WORK_DIR, 'pdf-url.txt'), `${publicPdfUrl}\n`, { mode: 0o600 });
fs.writeFileSync(path.join(process.env.WORK_DIR, 'credential-id.txt'), `${credentialId}\n`, { mode: 0o600 });
NODE

public_pdf_url="$(tr -d '\r\n' < "$work/pdf-url.txt")"
credential_id="$(tr -d '\r\n' < "$work/credential-id.txt")"

headers="$work/headers.txt"
pdf_one="$work/document-one.pdf"
pdf_status="$(curl -4 --silent --show-error \
  --connect-timeout 8 --max-time 25 --max-redirs 0 \
  --header "Accept: application/pdf" \
  --header "User-Agent: $user_agent" \
  --dump-header "$headers" \
  --output "$pdf_one" --write-out '%{http_code}' \
  "$public_pdf_url")"
[ "$pdf_status" = "200" ]
[ "$(head -c 5 "$pdf_one")" = "%PDF-" ]
pdf_size="$(stat -c '%s' "$pdf_one")"
[ "$pdf_size" -gt 0 ]
[ "$pdf_size" -le 5000000 ]

normalized="$work/headers-normalized.txt"
tr -d '\r' < "$headers" > "$normalized"

grep -Eiq '^content-type: *application/pdf([; ]|$)' "$normalized"
grep -Eiq '^cache-control:.*private.*no-store' "$normalized"
grep -Eiq '^x-content-type-options: *nosniff' "$normalized"
grep -Eiq '^referrer-policy: *no-referrer' "$normalized"
grep -Eiq '^x-robots-tag:.*noindex.*nofollow.*noarchive' "$normalized"

if grep -Eiq '^(set-cookie|x-powered-by|x-deca-[^:]*|x-kairoseth-[^:]*):' "$normalized"; then
  echo "FAIL KAIROSETH-CARGO-EDGE: forbidden public response header detected"
  exit 1
fi

csp_count="$(grep -Eic '^content-security-policy:' "$normalized" || true)"
report_only_count="$(grep -Eic '^content-security-policy-report-only:' "$normalized" || true)"
default_none=0
frame_none=0
upgrade_insecure=0
same_policy=0
hcdn_observed=0

grep -Eiq '^content-security-policy:.*default-src .none.' "$normalized" && default_none=1 || true
grep -Eiq '^content-security-policy:.*frame-ancestors .none.' "$normalized" && frame_none=1 || true
grep -Eiq '^content-security-policy:.*upgrade-insecure-requests' "$normalized" && upgrade_insecure=1 || true
grep -Eiq '^content-security-policy:.*default-src .none..*frame-ancestors .none.' "$normalized" && same_policy=1 || true
if grep -Eiq '^server: *hcdn|^x-hcdn-request-id:' "$normalized"; then
  hcdn_observed=1
fi

pdf_two="$work/document-two.pdf"
repeat_status="$(curl -4 --silent --show-error \
  --connect-timeout 8 --max-time 25 --max-redirs 0 \
  --header "Accept: application/pdf" \
  --header "User-Agent: $user_agent" \
  --output "$pdf_two" --write-out '%{http_code}' \
  "$public_pdf_url")"
[ "$repeat_status" = "200" ]
sha_one="sha256:$(sha256sum "$pdf_one" | awk '{print $1}')"
sha_two="sha256:$(sha256sum "$pdf_two" | awk '{print $1}')"
[ "$sha_one" = "$sha_two" ]

classification="policy_replaced_or_unknown"
if [ "$same_policy" -eq 1 ]; then
  classification="fail_closed_policy_present"
elif [ "$csp_count" -eq 0 ]; then
  classification="policy_missing"
elif [ "$upgrade_insecure" -eq 1 ] && [ "$default_none" -eq 0 ] && [ "$frame_none" -eq 0 ]; then
  classification="edge_upgrade_only"
elif [ "$default_none" -eq 1 ] || [ "$frame_none" -eq 1 ]; then
  classification="policy_partial_or_split"
fi

echo "CSP_EDGE_DIAGNOSTIC http=$pdf_status csp_count=$csp_count report_only_count=$report_only_count default_none=$default_none frame_none=$frame_none upgrade_insecure=$upgrade_insecure same_policy=$same_policy hcdn_observed=$hcdn_observed"
echo "CSP_EDGE_CLASSIFICATION=$classification"

export DEPLOYED_REVISION EDGE_CLASSIFICATION="$classification" PDF_SHA256="$sha_one"
export CSP_COUNT="$csp_count" REPORT_ONLY_COUNT="$report_only_count"
export DEFAULT_NONE="$default_none" FRAME_NONE="$frame_none" UPGRADE_INSECURE="$upgrade_insecure"
export SAME_POLICY="$same_policy" HCDN_OBSERVED="$hcdn_observed"
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const evidence = {
  schemaVersion: 1,
  check: 'kairoseth-cargo-current-deploy-edge-acceptance',
  repository: process.env.GITHUB_REPOSITORY ?? 'Emmakex/puente-deca',
  commit: process.env.GITHUB_SHA ?? 'unknown',
  runId: process.env.GITHUB_RUN_ID ?? 'local',
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '1',
  recordedAt: new Date().toISOString(),
  environment: 'https://kairoseth.com',
  deployedKairosethRevision: process.env.DEPLOYED_REVISION,
  synthetic: true,
  customerData: false,
  credentialEphemeral: true,
  credentialRevoked: false,
  pdfSha256: process.env.PDF_SHA256,
  csp: {
    classification: process.env.EDGE_CLASSIFICATION,
    count: Number(process.env.CSP_COUNT),
    reportOnlyCount: Number(process.env.REPORT_ONLY_COUNT),
    defaultNone: process.env.DEFAULT_NONE === '1',
    frameAncestorsNone: process.env.FRAME_NONE === '1',
    upgradeInsecureRequests: process.env.UPGRADE_INSECURE === '1',
    samePolicy: process.env.SAME_POLICY === '1',
    hcdnObserved: process.env.HCDN_OBSERVED === '1',
  },
};
fs.writeFileSync(path.join(process.env.KAIROSETH_CARGO_EDGE_EVIDENCE_DIR ?? '.artifacts/kairoseth-cargo-edge', 'current-deploy-edge-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
NODE

revoke_credential
trap - EXIT
rm -rf "$work"

EVIDENCE_PATH="$evidence_dir/current-deploy-edge-evidence.json" node <<'NODE'
const fs = require('node:fs');
const path = process.env.EVIDENCE_PATH;
const evidence = JSON.parse(fs.readFileSync(path, 'utf8'));
evidence.credentialRevoked = true;
fs.writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
NODE

if [ "$same_policy" -ne 1 ] || [ "$report_only_count" -ne 0 ]; then
  echo "FAIL KAIROSETH-CARGO-EDGE: production CSP is not fail-closed"
  exit 1
fi

echo "PASS KAIROSETH-CARGO-EDGE: deployed revision, immutable PDF and fail-closed CSP are green"
