import {
  createHash
} from "node:crypto";
import {
  readFile
} from "node:fs/promises";
import {
  resolve
} from "node:path";

const argument = (name) =>
  process.argv
    .find(
      (value) =>
        value.startsWith(
          `--${name}=`
        )
    )
    ?.slice(
      name.length + 3
    ) ?? null;

const fail = (
  code,
  message
) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const sha256 = (bytes) =>
  createHash("sha256")
    .update(bytes)
    .digest("hex");

const gateNameFor = (
  connector,
  platformVariant,
  result
) => {
  if (
    connector === "woocommerce" &&
    platformVariant === "woocommerce" &&
    result?.check ===
      "woocommerce-live-store-smoke"
  ) {
    return "wooCommerceLive";
  }

  const prestaVersion =
    String(
      result?.prestashopVersion ?? ""
    );

  if (
    connector === "prestashop" &&
    platformVariant ===
      "prestashop-1.7.8.x" &&
    result?.check ===
      "prestashop-live-store-smoke" &&
    /^1\.7\.8(?:\.|$)/.test(
      prestaVersion
    )
  ) {
    return "prestaShop178Live";
  }

  if (
    connector === "prestashop" &&
    platformVariant ===
      "prestashop-8.x" &&
    result?.check ===
      "prestashop-live-store-smoke" &&
    /^8\./.test(prestaVersion)
  ) {
    return "prestaShop8Live";
  }

  fail(
    "LIVE_EVIDENCE_VARIANT_INVALID",
    "Evidence platform variant is inconsistent with the live runtime"
  );
};

try {
  const evidenceArg =
    argument("evidence");

  if (!evidenceArg) {
    fail(
      "LIVE_EVIDENCE_PATH_REQUIRED",
      "Use --evidence=<acceptance-evidence.json>"
    );
  }

  const evidencePath =
    resolve(evidenceArg);
  const checksumPath =
    resolve(
      argument("checksum") ??
      `${evidenceArg}.sha256`
    );

  const [
    evidenceBytes,
    checksumText
  ] = await Promise.all([
    readFile(evidencePath),
    readFile(checksumPath, "utf8")
  ]);

  const digest =
    sha256(evidenceBytes);
  const recordedDigest =
    checksumText
      .trim()
      .split(/\s+/)[0];

  if (
    !/^[a-f0-9]{64}$/.test(
      recordedDigest
    ) ||
    recordedDigest !== digest
  ) {
    fail(
      "LIVE_EVIDENCE_CHECKSUM_MISMATCH",
      "Live-store evidence checksum mismatch"
    );
  }

  let evidence;

  try {
    evidence = JSON.parse(
      evidenceBytes.toString(
        "utf8"
      )
    );
  } catch {
    fail(
      "LIVE_EVIDENCE_JSON_INVALID",
      "Live-store evidence is not valid JSON"
    );
  }

  if (
    evidence?.schemaVersion !== 2 ||
    evidence?.check !==
      "puente-deca-connector-live-store-acceptance" ||
    evidence?.readOnly !== true ||
    evidence?.completionGate !== true ||
    evidence?.completionEligible !== true ||
    evidence?.dataClass !==
      "synthetic" ||
    evidence?.environmentClass !==
      "kairoseth-controlled"
  ) {
    fail(
      "LIVE_EVIDENCE_NOT_COMPLETION_GRADE",
      "Live-store evidence is not completion-grade"
    );
  }

  if (
    evidence?.repository !==
      "Emmakex/puente-deca" ||
    !/^[a-f0-9]{40}$/.test(
      String(
        evidence?.commit ?? ""
      )
    ) ||
    !/^connector-live-[0-9a-f-]{36}$/.test(
      String(
        evidence?.evidenceId ?? ""
      )
    ) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
      String(
        evidence?.recordedAt ?? ""
      )
    )
  ) {
    fail(
      "LIVE_EVIDENCE_IDENTITY_INVALID",
      "Live-store evidence identity metadata is invalid"
    );
  }

  const expectedConnectorVersion =
    String(
      evidence
        ?.expectedConnectorVersion ??
      ""
    ).trim();

  if (
    !expectedConnectorVersion ||
    evidence?.result
      ?.connectorVersion !==
      expectedConnectorVersion
  ) {
    fail(
      "LIVE_EVIDENCE_CONNECTOR_VERSION_INVALID",
      "Live-store evidence is not bound to the accepted connector version"
    );
  }

  const result = evidence?.result;
  const mapping =
    result?.orderMapping;

  if (
    result?.status !== "ok" ||
    result?.readOnly !== true ||
    result?.endpointHttps !== true ||
    result?.credentialConfigured !== true ||
    result?.cargoReadCheck !== true ||
    mapping?.requested !== true ||
    mapping?.mapped !== true ||
    mapping
      ?.requiredFactsPresent !==
      true ||
    !Array.isArray(
      mapping?.missingFacts
    ) ||
    mapping.missingFacts.length !== 0
  ) {
    fail(
      "LIVE_EVIDENCE_RESULT_INVALID",
      "Live-store completion evidence is missing a required green result"
    );
  }

  const gateName =
    gateNameFor(
      evidence.connector,
      evidence.platformVariant,
      result
    );

  const gate = {
    status: "pass",
    evidenceSha256:
      `sha256:${digest}`,
    repository:
      evidence.repository,
    commit:
      evidence.commit,
    runId:
      evidence.evidenceId,
    recordedAt:
      evidence.recordedAt
  };

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          "connector-live-evidence-verify",
        gateName,
        gate
      },
      null,
      2
    )}\n`
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check:
        "connector-live-evidence-verify",
      code:
        typeof error?.code ===
          "string"
          ? error.code
          : "LIVE_EVIDENCE_VERIFY_FAILED"
    })}\n`
  );
  process.exitCode = 1;
}
