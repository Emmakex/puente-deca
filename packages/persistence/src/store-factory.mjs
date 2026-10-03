import { JsonStore } from "./json-store.mjs";

const requireText = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
};

export const resolvePersistenceDriver = (env = process.env) => {
  const explicit =
    typeof env.PERSISTENCE_DRIVER === "string"
      ? env.PERSISTENCE_DRIVER.trim().toLowerCase()
      : "";

  if (explicit) return explicit;
  if (env.MONGODB_URI) return "mongodb";
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
        "JSON persistence is disabled in production. Configure MongoDB Atlas through MONGODB_URI."
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

  if (driver === "mongodb") {
    const { MongoStore } = await import(
      "./mongo-store.mjs"
    );

    return MongoStore.open({
      uri: requireText(
        env.MONGODB_URI,
        "MONGODB_URI"
      ),
      databaseName:
        env.MONGODB_DB_NAME?.trim() ||
        "kairoseth",
      now,
      idFactory,
      apiKeyFactory
    });
  }

  throw new Error(
    `Unsupported PERSISTENCE_DRIVER: ${driver}`
  );
}
