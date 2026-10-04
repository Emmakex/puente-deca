import test from "node:test";
import assert from "node:assert/strict";

import {
  createEcmrAmendmentChain,
  appendEcmrAmendment,
  verifyEcmrAmendmentChain
} from "../src/amendment-chain.mjs";

const XML_1 =
  "<rsm:eCMR><ram:Content>original</ram:Content></rsm:eCMR>";
const XML_2 =
  "<rsm:eCMR><ram:Content>corrected</ram:Content></rsm:eCMR>";

const actor = (
  actorId =
    "ES-B12345678"
) => ({
  actorId,
  partyRole: "sender",
  identityScheme:
    "tax-id"
});

test(
  "creates an immutable original record and appends a cryptographically linked amendment",
  () => {
    const initial =
      createEcmrAmendmentChain({
        xml: XML_1,
        actor:
          actor(),
        reason:
          "initial issue",
        createdAt:
          "2026-10-04T14:20:00.000Z",
        idFactory:
          () => "one"
      });

    const revised =
      appendEcmrAmendment({
        chain:
          initial,
        xml: XML_2,
        actor:
          actor(
            "ES-B87654321"
          ),
        reason:
          "correct consignee details",
        createdAt:
          "2026-10-04T14:25:00.000Z",
        idFactory:
          () => "two"
      });

    assert.equal(
      revised.length,
      2
    );
    assert.equal(
      revised[0].xml,
      XML_1
    );
    assert.equal(
      revised[1].xml,
      XML_2
    );
    assert.equal(
      revised[1]
        .previousVersionId,
      revised[0]
        .versionId
    );
    assert.equal(
      revised[1]
        .previousContentHash,
      revised[0]
        .contentHash
    );
    assert.equal(
      revised[1]
        .previousChainHash,
      revised[0]
        .chainHash
    );
    assert.equal(
      revised[1]
        .originalContentHash,
      revised[0]
        .contentHash
    );

    const verification =
      verifyEcmrAmendmentChain(
        revised
      );

    assert.equal(
      verification.valid,
      true
    );
    assert.equal(
      verification.versions,
      2
    );
    assert.equal(
      verification
        .latestContentHash,
      revised[1]
        .contentHash
    );
  }
);

test(
  "preserves exact XML whitespace as immutable content",
  () => {
    const exact =
      " \n<rsm:eCMR>original</rsm:eCMR>\n ";

    const chain =
      createEcmrAmendmentChain({
        xml: exact,
        actor:
          actor(),
        reason:
          "initial issue",
        createdAt:
          "2026-10-04T14:20:00.000Z",
        idFactory:
          () => "exact"
      });

    assert.equal(
      chain[0].xml,
      exact
    );

    const trimmed =
      structuredClone(
        chain
      );
    trimmed[0].xml =
      exact.trim();

    const result =
      verifyEcmrAmendmentChain(
        trimmed
      );

    assert.equal(
      result.valid,
      false
    );
    assert.equal(
      result.code,
      "ECMR_AMENDMENT_CONTENT_HASH_MISMATCH"
    );
  }
);

test(
  "detects one-byte changes to preserved original XML",
  () => {
    const chain =
      createEcmrAmendmentChain({
        xml: XML_1,
        actor:
          actor(),
        reason:
          "initial issue",
        createdAt:
          "2026-10-04T14:20:00.000Z",
        idFactory:
          () => "one"
      });

    const tampered =
      structuredClone(
        chain
      );
    tampered[0].xml =
      tampered[0].xml
        .replace(
          "original",
          "originaL"
        );

    const result =
      verifyEcmrAmendmentChain(
        tampered
      );

    assert.equal(
      result.valid,
      false
    );
    assert.equal(
      result.code,
      "ECMR_AMENDMENT_CONTENT_HASH_MISMATCH"
    );
  }
);

test(
  "detects actor or reason changes through the chain hash",
  () => {
    const chain =
      createEcmrAmendmentChain({
        xml: XML_1,
        actor:
          actor(),
        reason:
          "initial issue",
        createdAt:
          "2026-10-04T14:20:00.000Z",
        idFactory:
          () => "one"
      });
    const tampered =
      structuredClone(
        chain
      );
    tampered[0].reason =
      "different reason";

    const result =
      verifyEcmrAmendmentChain(
        tampered
      );

    assert.equal(
      result.valid,
      false
    );
    assert.equal(
      result.code,
      "ECMR_AMENDMENT_CHAIN_HASH_MISMATCH"
    );
  }
);

test(
  "rejects broken predecessor linkage and reordered versions",
  () => {
    const initial =
      createEcmrAmendmentChain({
        xml: XML_1,
        actor:
          actor(),
        reason:
          "initial issue",
        createdAt:
          "2026-10-04T14:20:00.000Z",
        idFactory:
          () => "one"
      });
    const revised =
      appendEcmrAmendment({
        chain:
          initial,
        xml: XML_2,
        actor:
          actor(),
        reason:
          "correction",
        createdAt:
          "2026-10-04T14:25:00.000Z",
        idFactory:
          () => "two"
      });

    const broken =
      structuredClone(
        revised
      );
    broken[1]
      .previousVersionId =
      "ecmrv_wrong";

    assert.equal(
      verifyEcmrAmendmentChain(
        broken
      ).code,
      "ECMR_AMENDMENT_PREVIOUS_LINK_MISMATCH"
    );

    assert.equal(
      verifyEcmrAmendmentChain(
        [
          revised[1],
          revised[0]
        ]
      ).code,
      "ECMR_AMENDMENT_VERSION_SEQUENCE_INVALID"
    );
  }
);

test(
  "rejects no-op amendments and non-increasing timestamps",
  () => {
    const chain =
      createEcmrAmendmentChain({
        xml: XML_1,
        actor:
          actor(),
        reason:
          "initial issue",
        createdAt:
          "2026-10-04T14:20:00.000Z",
        idFactory:
          () => "one"
      });

    assert.throws(
      () =>
        appendEcmrAmendment({
          chain,
          xml: XML_1,
          actor:
            actor(),
          reason:
            "no change",
          createdAt:
            "2026-10-04T14:25:00.000Z",
          idFactory:
            () => "two"
        }),
      (error) =>
        error.code ===
        "ECMR_AMENDMENT_NO_CHANGE"
    );

    assert.throws(
      () =>
        appendEcmrAmendment({
          chain,
          xml: XML_2,
          actor:
            actor(),
          reason:
            "correction",
          createdAt:
            "2026-10-04T14:20:00.000Z",
          idFactory:
            () => "two"
        }),
      (error) =>
        error.code ===
        "ECMR_AMENDMENT_TIME_ORDER_INVALID"
    );
  }
);
