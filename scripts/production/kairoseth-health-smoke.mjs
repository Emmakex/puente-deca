const baseUrl =
  process.env.KAIROSETH_PUBLIC_BASE_URL?.trim() ||
  "https://kairoseth.com";
const secret =
  process.env.OPERATIONS_HEALTH_SECRET?.trim() ?? "";

const fail = (code) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check:
        "kairoseth-puente-deca-health",
      code
    })}\n`
  );
  process.exitCode = 1;
};

try {
  const root = new URL(baseUrl);

  if (
    root.protocol !== "https:" ||
    root.hostname !== "kairoseth.com" ||
    root.pathname !== "/" ||
    root.search ||
    root.hash
  ) {
    throw Object.assign(
      new Error(
        "Kairoseth public base URL must be canonical"
      ),
      {
        code:
          "NON_CANONICAL_KAIROSETH_URL"
      }
    );
  }

  if (secret.length < 32) {
    throw Object.assign(
      new Error(
        "operations health secret is missing"
      ),
      {
        code:
          "OPERATIONS_HEALTH_SECRET_INVALID"
      }
    );
  }

  const response = await fetch(
    new URL(
      "/api/health/puente-deca",
      root
    ),
    {
      redirect: "manual",
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization:
          `Bearer ${secret}`
      },
      signal:
        AbortSignal.timeout(10_000)
    }
  );

  if (!response.ok) {
    throw Object.assign(
      new Error(
        "Kairoseth health route is unavailable"
      ),
      {
        code:
          "KAIROSETH_HEALTH_HTTP_ERROR"
      }
    );
  }

  const body =
    await response.json();

  if (
    body?.status !== "ok" ||
    body?.service !==
      "puente-deca-health" ||
    body?.engine !== "ready"
  ) {
    throw Object.assign(
      new Error(
        "Puente DeCA engine is not ready through Kairoseth"
      ),
      {
        code:
          "KAIROSETH_ENGINE_NOT_READY"
      }
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          "kairoseth-puente-deca-health",
        origin: root.origin,
        engine: "ready"
      },
      null,
      2
    )}\n`
  );
} catch (error) {
  fail(
    typeof error?.code === "string"
      ? error.code
      : "KAIROSETH_HEALTH_SMOKE_FAILED"
  );
}
