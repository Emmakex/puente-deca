import { readFile } from "node:fs/promises";

const workflow = await readFile(
  ".github/workflows/kairoseth-cargo-acceptance-fixture.yml",
  "utf8",
);

for (const required of [
  "Kairoseth fixture request failed (curl=",
  "Sanitized response: status=",
  "RAW_RESPONSE_PATH=\"$raw\" node",
  "Intentionally do not print the raw body",
]) {
  if (!workflow.includes(required)) {
    throw new Error(`Fixture diagnostics contract missing: ${required}`);
  }
}

if (workflow.includes('cat "$raw"') || workflow.includes('head -c 400 "$raw"')) {
  throw new Error("Fixture diagnostics must never print the raw protected response");
}

console.log("Fixture diagnostics contract OK (status-only, no protected raw body output)");
