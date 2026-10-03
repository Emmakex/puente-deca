import { JsonStore } from "./json-store.mjs";

const requireText = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
};

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
};

export const resolvePersistenceDriver = (env = process.env) => {
  const explicit =
    typeof env.PERSISTENCE_DRIVER === "string"
      ? env.PERSISTENCE_DRIVER.trim().toLowerCase()
      : "";

  if (explicit) return explicit;
  if (env.DATABASE_URL) return "postgres";
  return "json";
};

export async function openOperationalStore({
  env = process.env,
  now,
  idFactory,
  apiKeyFactory
} = {}) {
  const driver = resolvePersistenceDriver(env);

  if (driver === "json") {
    if (
      env.NODE_ENV === "production" &&
      env.ALLOW_JSON_STORE_IN_PRODUCTION !== "1"
    ) {
      throw new Error(
        "JSON persistence is disabled in production. Configure PERSISTENCE_DRIVER=postgres and DATABASE_URL."
      );
    }

    return JsonStore.open({
      filePath:
        env.STORE_PATH ??
        ".data/store.json",
      now,
      idFactory,
      apiKeyFactory
    });
  }

  if (driver === "postgres") {
    const connectionString = requireText(
      env.DATABASE_URL,
      "DATABASE_URL"
    );

    const { PostgresStore } = await import(
      "./postgres-store.mjs"
    );

    return PostgresStore.open({
      connectionString,
      max: positiveInteger(
        env.PGPOOL_MAX,
        10
      ),
      connectionTimeoutMillis:
        positiveInteger(
          env.PG_CONNECTION_TIMEOUT_MS,
          5000
        ),
      idleTimeoutMillis:
        positiveInteger(
          env.PG_IDLE_TIMEOUT_MS,
          30000
        ),
      now,
      idFactory,
      apiKeyFactory
    });
  }

  throw new Error(
    `Unsupported PERSISTENCE_DRIVER: ${driver}`
  );
}
