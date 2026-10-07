import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowPath = ".github/workflows/backup-restore-acceptance.yml";
const protectedRunner =
  "runs-on: [self-hosted, Linux, X64, kairoseth-ci, kairoseth-platform]";

test("DeCA Backup Restore Acceptance stays on the protected Kairoseth runner", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(
    workflow,
    new RegExp(protectedRunner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "DR acceptance must execute on the protected Kairoseth self-hosted runner"
  );

  assert.doesNotMatch(
    workflow,
    /runs-on:\s*ubuntu-latest/,
    "DR acceptance must not use GitHub-hosted ubuntu-latest for direct MongoDB access"
  );

  assert.doesNotMatch(
    workflow,
    /runs-on:\s*ubuntu-24\.04/,
    "DR acceptance must not use a GitHub-hosted Ubuntu runner for direct MongoDB access"
  );

  assert.match(
    workflow,
    /environment:\s*deca-production/,
    "DR acceptance must remain protected by the deca-production environment"
  );
});
