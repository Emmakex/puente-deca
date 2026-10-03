import {
  FileArtifactStore
} from "./file-artifact-store.mjs";

export const resolveArtifactDriver = (
  env = process.env
) => {
  const explicit =
    typeof env.ARTIFACT_DRIVER === "string"
      ? env.ARTIFACT_DRIVER.trim().toLowerCase()
      : "";

  if (explicit) return explicit;
  if (env.MONGODB_URI) return "gridfs";
  return "file";
};

export async function openArtifactStore({
  env = process.env
} = {}) {
  const driver = resolveArtifactDriver(env);

  if (driver === "file") {
    if (
      env.NODE_ENV === "production" &&
      env.ALLOW_FILE_ARTIFACTS_IN_PRODUCTION !== "1"
    ) {
      throw new Error(
        "Filesystem artifact storage is disabled in production. Configure ARTIFACT_DRIVER=gridfs with MongoDB Atlas."
      );
    }

    return FileArtifactStore.open({
      rootDirectory:
        env.ARTIFACT_DIR ??
        ".data/documents"
    });
  }

  if (driver === "gridfs") {
    const { GridFsArtifactStore } = await import(
      "./gridfs-artifact-store.mjs"
    );

    return GridFsArtifactStore.open({
      uri: env.MONGODB_URI,
      databaseName:
        env.MONGODB_DB_NAME?.trim() ||
        "kairoseth",
      bucketName:
        env.DECA_GRIDFS_BUCKET?.trim() ||
        "deca_pdf"
    });
  }

  throw new Error(
    `Unsupported ARTIFACT_DRIVER: ${driver}`
  );
}
