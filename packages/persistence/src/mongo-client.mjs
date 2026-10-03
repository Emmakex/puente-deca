import {
  MongoClient,
  ServerApiVersion
} from "mongodb";

const requireText = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
};

export async function openKairosethMongoClient({
  uri,
  appName = "kairoseth-puente-deca"
} = {}) {
  const client = new MongoClient(
    requireText(uri, "uri"),
    {
      appName,
      family: 4,
      connectTimeoutMS: 10_000,
      serverSelectionTimeoutMS: 10_000,
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
      }
    }
  );

  await client.connect();
  return client;
}
