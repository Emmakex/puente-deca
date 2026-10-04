import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync
} from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";
import {
  tmpdir
} from "node:os";
import {
  join
} from "node:path";
import {
  JsonStore
} from "../src/json-store.mjs";

const custody = (
  reference
) => ({
  mode: "external",
  provider:
    "Example External HSM",
  keyReference:
    reference,
  controlModel:
    "external-sole-control"
});

const signer = {
  signerId:
    "kairoseth-user:user_001",
  partyRole:
    "sender",
  identityScheme:
    "kairoseth-user",
  identityAssurance:
    "platform-authenticated"
};

const withStore = async (
  fn
) => {
  const directory =
    await mkdtemp(
      join(
        tmpdir(),
        "pdeca-signer-keys-"
      )
    );
  const filePath =
    join(
      directory,
      "store.json"
    );
  let id = 0;
  let tick = 0;
  const store =
    await JsonStore.open({
      filePath,
      idFactory: () =>
        String(
          ++id
        ).padStart(
          4,
          "0"
        ),
      now: () =>
        new Date(
          Date.parse(
            "2026-10-04T18:00:00.000Z"
          ) +
          tick++ * 1000
        )
    });

  try {
    await fn({
      store,
      filePath
    });
  } finally {
    await rm(
      directory,
      {
        recursive: true,
        force: true
      }
    );
  }
};

test(
  "persists tenant-scoped signer public keys without exposing PEM in list responses",
  async () => {
    await withStore(
      async ({
        store,
        filePath
      }) => {
        const first =
          await store
            .createOrganization({
              name:
                "First"
            });
        const second =
          await store
            .createOrganization({
              name:
                "Second"
            });
        const pair =
          generateKeyPairSync(
            "ed25519"
          );

        const registered =
          await store
            .registerEcmrSignerKey({
              organizationId:
                first
                  .organizationId,
              label:
                "Sender key",
              publicKey:
                pair.publicKey,
              signer,
              custody:
                custody(
                  "hsm://first/key-001"
                )
            });

        assert.match(
          registered
            .publicKeyFingerprint,
          /^sha256:[0-9a-f]{64}$/
        );
        assert.equal(
          Object.hasOwn(
            registered,
            "publicKeyPem"
          ),
          false
        );

        const firstList =
          await store
            .listEcmrSignerKeys({
              organizationId:
                first
                  .organizationId
            });
        const secondList =
          await store
            .listEcmrSignerKeys({
              organizationId:
                second
                  .organizationId
            });

        assert.equal(
          firstList.length,
          1
        );
        assert.equal(
          secondList.length,
          0
        );

        const internal =
          await store
            .getEcmrSignerKey({
              organizationId:
                first
                  .organizationId,
              signerKeyId:
                registered
                  .signerKeyId
            });

        assert.match(
          internal
            .publicKeyPem,
          /BEGIN PUBLIC KEY/
        );
        assert.equal(
          internal
            .custody
            .privateKeyStored,
          false
        );

        assert.equal(
          await store
            .getEcmrSignerKey({
              organizationId:
                second
                  .organizationId,
              signerKeyId:
                registered
                  .signerKeyId
            }),
          null
        );

        const raw =
          await readFile(
            filePath,
            "utf8"
          );

        assert.equal(
          raw.includes(
            "PRIVATE KEY"
          ),
          false
        );
      }
    );
  }
);

test(
  "revokes and rotates signer keys with audit evidence and explicit lineage",
  async () => {
    await withStore(
      async ({
        store
      }) => {
        const organization =
          await store
            .createOrganization({
              name:
                "Organization 001"
            });
        const first =
          generateKeyPairSync(
            "ed25519"
          );
        const second =
          generateKeyPairSync(
            "ed25519"
          );

        const registered =
          await store
            .registerEcmrSignerKey({
              organizationId:
                organization
                  .organizationId,
              label:
                "Sender key v1",
              publicKey:
                first.publicKey,
              signer,
              custody:
                custody(
                  "hsm://org/key-001"
                )
            });

        const rotated =
          await store
            .rotateEcmrSignerKey({
              organizationId:
                organization
                  .organizationId,
              signerKeyId:
                registered
                  .signerKeyId,
              label:
                "Sender key v2",
              publicKey:
                second.publicKey,
              custody:
                custody(
                  "hsm://org/key-002"
                ),
              reason:
                "scheduled rotation"
            });

        assert.equal(
          rotated.previous
            .revokedReason,
          "scheduled rotation"
        );
        assert.equal(
          rotated.next
            .replacesSignerKeyId,
          registered
            .signerKeyId
        );
        assert.notEqual(
          rotated.next
            .publicKeyFingerprint,
          registered
            .publicKeyFingerprint
        );

        const revoked =
          await store
            .revokeEcmrSignerKey({
              organizationId:
                organization
                  .organizationId,
              signerKeyId:
                rotated.next
                  .signerKeyId,
              reason:
                "key retired"
            });

        assert.equal(
          revoked.revokedReason,
          "key retired"
        );

        const events =
          await store
            .listAuditEvents({
              organizationId:
                organization
                  .organizationId
            });
        const types =
          events.map(
            (entry) =>
              entry.type
          );

        assert.ok(
          types.includes(
            "ecmr.signer_key.registered"
          )
        );
        assert.ok(
          types.includes(
            "ecmr.signer_key.rotated"
          )
        );
        assert.ok(
          types.includes(
            "ecmr.signer_key.revoked"
          )
        );
      }
    );
  }
);

test(
  "rejects duplicate signer public-key fingerprints per organization",
  async () => {
    await withStore(
      async ({
        store
      }) => {
        const organization =
          await store
            .createOrganization({
              name:
                "Organization 001"
            });
        const pair =
          generateKeyPairSync(
            "ed25519"
          );

        await store
          .registerEcmrSignerKey({
            organizationId:
              organization
                .organizationId,
            label:
              "Sender key",
            publicKey:
              pair.publicKey,
            signer,
            custody:
              custody(
                "hsm://org/key-001"
              )
          });

        await assert.rejects(
          () =>
            store
              .registerEcmrSignerKey({
                organizationId:
                  organization
                    .organizationId,
                label:
                  "Duplicate key",
                publicKey:
                  pair.publicKey,
                signer,
                custody:
                  custody(
                    "hsm://org/key-copy"
                  )
              }),
          (
            error
          ) =>
            error.code ===
            "ECMR_SIGNER_KEY_DUPLICATE"
        );
      }
    );
  }
);
