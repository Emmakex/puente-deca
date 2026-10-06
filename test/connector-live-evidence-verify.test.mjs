import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const verifier =
  "scripts/production/connector-live-evidence-verify.mjs";

const baseEvidence = ({
  connector = "woocommerce",
  platformVariant = "woocommerce",
  connectorVersion = "0.2.0",
  prestashopVersion = undefined
} = {}) => ({
  schemaVersion: 2,
  evidenceId:
    "connector-live-123e4567-e89b-12d3-a456-426614174000",
  check:
    "puente-deca-connector-live-store-acceptance",
  connector,
  platformVariant,
  repository:
    "Emmakex/puente-deca",
  commit:
    "a".repeat(40),
  recordedAt:
    "2026-10-06T18:45:00.000Z",
  readOnly: true,
  completionGate: true,
  completionEligible: true,
  dataClass: "synthetic",
  environmentClass:
    "kairoseth-controlled",
  expectedConnectorVersion:
    connectorVersion,
  orderMappingRequired: true,
  result: {
    status: "ok",
    check:
      connector === "woocommerce"
        ? "woocommerce-live-store-smoke"
        : "prestashop-live-store-smoke",
    readOnly: true,
    connectorVersion,
    endpointHttps: true,
    credentialConfigured: true,
    cargoReadCheck: true,
    orderMapping: {
      requested: true,
      mapped: true,
      requiredFactsPresent: true,
      missingFacts: []
    },
    ...(prestashopVersion
      ? { prestashopVersion }
      : {
          wordpressVersion: "6.8.0",
          woocommerceVersion: "10.2.0"
        })
  }
});

const writeEvidence = async (
  directory,
  evidence,
  { tamperChecksum = false } = {}
) => {
  const path = join(
    directory,
    "evidence.json"
  );
  const checksum = `${path}.sha256`;
  const serialized =
    `${JSON.stringify(
      evidence,
      null,
      2
    )}\n`;
  const digest =
    createHash("sha256")
      .update(serialized)
      .digest("hex");

  await writeFile(
    path,
    serialized,
    "utf8"
  );
  await writeFile(
    checksum,
    `${tamperChecksum
      ? "0".repeat(64)
      : digest}  evidence.json\n`,
    "utf8"
  );

  return {
    path,
    checksum,
    digest
  };
};

const verify = (
  path,
  checksum
) =>
  spawnSync(
    process.execPath,
    [
      verifier,
      `--evidence=${path}`,
      `--checksum=${checksum}`
    ],
    {
      encoding: "utf8"
    }
  );

for (const fixture of [
  {
    name: "WooCommerce",
    evidence: baseEvidence(),
    gateName:
      "wooCommerceLive"
  },
  {
    name: "PrestaShop 1.7.8.x",
    evidence: baseEvidence({
      connector: "prestashop",
      platformVariant:
        "prestashop-1.7.8.x",
      prestashopVersion:
        "1.7.8.11"
    }),
    gateName:
      "prestaShop178Live"
  },
  {
    name: "PrestaShop 8.x",
    evidence: baseEvidence({
      connector: "prestashop",
      platformVariant:
        "prestashop-8.x",
      prestashopVersion:
        "8.1.2"
    }),
    gateName:
      "prestaShop8Live"
  }
]) {
  test(
    `maps ${fixture.name} completion evidence to its final gate`,
    async () => {
      const directory =
        await mkdtemp(
          join(
            tmpdir(),
            "pdeca-live-evidence-"
          )
        );

      try {
        const files =
          await writeEvidence(
            directory,
            fixture.evidence
          );
        const result = verify(
          files.path,
          files.checksum
        );

        assert.equal(
          result.status,
          0,
          result.stderr
        );

        const output =
          JSON.parse(
            result.stdout
          );

        assert.equal(
          output.gateName,
          fixture.gateName
        );
        assert.deepEqual(
          output.gate,
          {
            status: "pass",
            evidenceSha256:
              `sha256:${files.digest}`,
            repository:
              "Emmakex/puente-deca",
            commit:
              "a".repeat(40),
            runId:
              fixture.evidence
                .evidenceId,
            recordedAt:
              fixture.evidence
                .recordedAt
          }
        );
      } finally {
        await rm(
          directory,
          {
            recursive: true,
            force: true
          }
        );
      }
    }
  );
}

test(
  "rejects diagnostic evidence that is not completion eligible",
  async () => {
    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "pdeca-live-evidence-"
        )
      );

    try {
      const evidence =
        baseEvidence();
      evidence.completionEligible =
        false;

      const files =
        await writeEvidence(
          directory,
          evidence
        );
      const result = verify(
        files.path,
        files.checksum
      );

      assert.notEqual(
        result.status,
        0
      );
      assert.match(
        result.stderr,
        /LIVE_EVIDENCE_NOT_COMPLETION_GRADE/
      );
    } finally {
      await rm(
        directory,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "rejects evidence when its checksum sidecar does not match",
  async () => {
    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "pdeca-live-evidence-"
        )
      );

    try {
      const files =
        await writeEvidence(
          directory,
          baseEvidence(),
          {
            tamperChecksum: true
          }
        );
      const result = verify(
        files.path,
        files.checksum
      );

      assert.notEqual(
        result.status,
        0
      );
      assert.match(
        result.stderr,
        /LIVE_EVIDENCE_CHECKSUM_MISMATCH/
      );
    } finally {
      await rm(
        directory,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "rejects a forged PrestaShop variant inconsistent with the runtime version",
  async () => {
    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "pdeca-live-evidence-"
        )
      );

    try {
      const evidence =
        baseEvidence({
          connector: "prestashop",
          platformVariant:
            "prestashop-1.7.8.x",
          prestashopVersion:
            "8.1.2"
        });
      const files =
        await writeEvidence(
          directory,
          evidence
        );
      const result = verify(
        files.path,
        files.checksum
      );

      assert.notEqual(
        result.status,
        0
      );
      assert.match(
        result.stderr,
        /LIVE_EVIDENCE_VARIANT_INVALID/
      );
    } finally {
      await rm(
        directory,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);
