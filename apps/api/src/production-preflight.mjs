const parsePositiveInteger = (value) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
};

const validMongoUri = (value) =>
  typeof value === "string" &&
  /^(mongodb(?:\+srv)?):\/\//.test(value.trim());

const validSecret = (value) =>
  typeof value === "string" &&
  value.trim().length >= 32;

export function validateProductionEnvironment(
  env = process.env
) {
  const errors = [];
  const warnings = [];

  if (env.NODE_ENV !== "production") {
    errors.push(
      "NODE_ENV must be production."
    );
  }

  let publicUrl = null;
  try {
    publicUrl = new URL(
      String(env.PUBLIC_BASE_URL ?? "")
    );
  } catch {
    errors.push(
      "PUBLIC_BASE_URL must be a valid URL."
    );
  }

  if (publicUrl) {
    if (
      publicUrl.protocol !== "https:" ||
      publicUrl.hostname !== "kairoseth.com" ||
      publicUrl.pathname.replace(/\/$/, "") !==
        "/deca" ||
      publicUrl.search ||
      publicUrl.hash
    ) {
      errors.push(
        "PUBLIC_BASE_URL must be exactly https://kairoseth.com/deca (optional trailing slash only)."
      );
    }
  }

  if (!validMongoUri(env.MONGODB_URI)) {
    errors.push(
      "MONGODB_URI must be a MongoDB/Atlas connection string."
    );
  }

  if (
    (env.MONGODB_DB_NAME ?? "").trim() !==
    "kairoseth"
  ) {
    errors.push(
      "MONGODB_DB_NAME must be kairoseth."
    );
  }

  const persistenceDriver =
    (env.PERSISTENCE_DRIVER ?? "")
      .trim()
      .toLowerCase();
  if (
    persistenceDriver &&
    persistenceDriver !== "mongodb"
  ) {
    errors.push(
      "PERSISTENCE_DRIVER must be mongodb in production."
    );
  }

  const artifactDriver =
    (env.ARTIFACT_DRIVER ?? "")
      .trim()
      .toLowerCase();
  if (
    artifactDriver &&
    artifactDriver !== "gridfs"
  ) {
    errors.push(
      "ARTIFACT_DRIVER must be gridfs in production."
    );
  }

  if (
    (env.DECA_GRIDFS_BUCKET ?? "").trim() !==
    "deca_pdf"
  ) {
    errors.push(
      "DECA_GRIDFS_BUCKET must be deca_pdf."
    );
  }

  if (
    env.ALLOW_JSON_STORE_IN_PRODUCTION === "1"
  ) {
    errors.push(
      "ALLOW_JSON_STORE_IN_PRODUCTION must not be enabled."
    );
  }

  if (
    env.ALLOW_FILE_ARTIFACTS_IN_PRODUCTION === "1"
  ) {
    errors.push(
      "ALLOW_FILE_ARTIFACTS_IN_PRODUCTION must not be enabled."
    );
  }

  if (
    !validSecret(env.KAIROSETH_SERVICE_SECRET)
  ) {
    errors.push(
      "KAIROSETH_SERVICE_SECRET must contain at least 32 characters."
    );
  }

  if (
    !validSecret(
      env.KAIROSETH_PUBLIC_PROXY_SECRET
    )
  ) {
    errors.push(
      "KAIROSETH_PUBLIC_PROXY_SECRET must contain at least 32 characters."
    );
  }

  const port = parsePositiveInteger(
    env.PORT ?? "8080"
  );
  if (!port || port > 65535) {
    errors.push(
      "PORT must be between 1 and 65535."
    );
  }

  for (const [name, fallback] of [
    ["RATE_LIMIT_WINDOW_MS", "60000"],
    ["RATE_LIMIT_MAX_REQUESTS", "600"],
    ["RATE_LIMIT_MAX_ENTRIES", "10000"]
  ]) {
    if (
      !parsePositiveInteger(
        env[name] ?? fallback
      )
    ) {
      errors.push(
        `${name} must be a positive integer.`
      );
    }
  }

  if (
    String(env.MONGODB_URI ?? "").includes(
      "localhost"
    )
  ) {
    warnings.push(
      "MONGODB_URI appears to target localhost."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    target: {
      publicBaseUrl:
        publicUrl?.toString() ?? null,
      database:
        env.MONGODB_DB_NAME ?? null,
      artifactBucket:
        env.DECA_GRIDFS_BUCKET ?? null,
      port
    }
  };
}

export function assertProductionEnvironment(
  env = process.env
) {
  const result =
    validateProductionEnvironment(env);

  if (!result.valid) {
    const error = new Error(
      [
        "Puente DeCA production preflight failed:",
        ...result.errors.map(
          (message) => `- ${message}`
        )
      ].join("\n")
    );
    error.code =
      "PRODUCTION_PREFLIGHT_FAILED";
    error.validation = result;
    throw error;
  }

  return result;
}
