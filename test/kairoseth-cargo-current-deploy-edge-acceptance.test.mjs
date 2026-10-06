import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync(
  '.github/workflows/kairoseth-cargo-csp-edge-diagnostic.yml',
  'utf8',
);
const script = fs.readFileSync(
  'scripts/production/kairoseth-cargo-current-deploy-edge-acceptance.sh',
  'utf8',
);

test('edge acceptance stays protected and uses the existing production secret', () => {
  assert.match(workflow, /environment: deca-production/u);
  assert.match(workflow, /OPERATIONS_HEALTH_SECRET: \$\{\{ secrets\.OPERATIONS_HEALTH_SECRET \}\}/u);
  assert.match(workflow, /ref: main/u);
  assert.match(workflow, /current-deploy-edge-evidence\.json/u);
});

test('edge acceptance is bound to a client-visible deployed revision', () => {
  assert.match(script, /\/api\/health/u);
  assert.match(script, /\^\[a-f0-9\]\{40\}\$/u);
  assert.match(script, /deployedKairosethRevision/u);
});

test('edge acceptance requires fail-closed CSP and immutable PDF', () => {
  assert.match(script, /default-src \.none\./u);
  assert.match(script, /frame-ancestors \.none\./u);
  assert.match(script, /sha_one/u);
  assert.match(script, /sha_two/u);
  assert.match(script, /same_policy.*-ne 1/u);
});

test('edge acceptance revokes ephemeral credentials and never persists public URL or credential id', () => {
  assert.match(script, /revoke_credential/u);
  assert.match(script, /credentialRevoked/u);
  assert.doesNotMatch(script, /publicPdfUrlSha256/u);
  assert.doesNotMatch(script, /credentialIdSha256/u);
});
