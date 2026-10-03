import test from "node:test";
import assert from "node:assert/strict";
import {
  assertProductionEnvironment,
  validateProductionEnvironment
} from "../src/production-preflight.mjs";

const validEnv = () => ({
  NODE_ENV: "production",
  PORT: "8080",
  PUBLIC_BASE_URL:
    "https://kairoseth.com/deca",
  MONGODB_URI:
    "mongodb+srv://service:secret@example.mongodb.net",
  MONGODB_DB_NAME: "kairoseth",
  PERSISTENCE_DRIVER: "mongodb",
  ARTIFACT_DRIVER: "gridfs",
  DECA_GRIDFS_BUCKET: "deca_pdf",
  ALLOW_JSON_STORE_IN_PRODUCTION: "0",
  ALLOW_FILE_ARTIFACTS_IN_PRODUCTION: "0",
  KAIROSETH_SERVICE_SECRET:
    "0123456789abcdef0123456789abcdef",
  RATE_LIMIT_WINDOW_MS: "60000",
  RATE_LIMIT_MAX_REQUESTS: "600",
  RATE_LIMIT_MAX_ENTRIES: "10000"
});

test("production preflight accepts the canonical Kairoseth topology", () => {
  const result =
    validateProductionEnvironment(
      validEnv()
    );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(
    result.target.database,
    "kairoseth"
  );
  assert.equal(
    result.target.artifactBucket,
    "deca_pdf"
  );
});

test("production preflight rejects local persistence and emergency overrides", () => {
  const env = validEnv();
  env.PERSISTENCE_DRIVER = "json";
  env.ARTIFACT_DRIVER = "file";
  env.ALLOW_JSON_STORE_IN_PRODUCTION =
    "1";
  env.ALLOW_FILE_ARTIFACTS_IN_PRODUCTION =
    "1";

  const result =
    validateProductionEnvironment(env);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (message) =>
        message.includes(
          "PERSISTENCE_DRIVER"
        )
    )
  );
  assert.ok(
    result.errors.some(
      (message) =>
        message.includes(
          "ARTIFACT_DRIVER"
        )
    )
  );
  assert.ok(
    result.errors.some(
      (message) =>
        message.includes(
          "ALLOW_JSON_STORE"
        )
    )
  );
});

test("production preflight locks public DeCA URLs to kairoseth.com", () => {
  const env = validEnv();
  env.PUBLIC_BASE_URL =
    "https://deca.example.com";

  assert.throws(
    () =>
      assertProductionEnvironment(env),
    (error) =>
      error?.code ===
        "PRODUCTION_PREFLIGHT_FAILED" &&
      !error.message.includes(
        env.KAIROSETH_SERVICE_SECRET
      )
  );
});

test("production preflight never returns secret values", () => {
  const env = validEnv();
  const result =
    validateProductionEnvironment(env);
  const serialized =
    JSON.stringify(result);

  assert.doesNotMatch(
    serialized,
    /0123456789abcdef0123456789abcdef/
  );
  assert.doesNotMatch(
    serialized,
    /service:secret/
  );
});
