const baseUrlText =
  process.env.DECA_ENGINE_SMOKE_BASE_URL?.trim() ?? "";
const proxySecret =
  process.env.DECA_ENGINE_SMOKE_PROXY_SECRET?.trim() ?? "";

const fail = (code) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check: "engine-origin-smoke",
      code,
    })}\n`,
  );
  process.exitCode = 1;
};

const request = async (
  baseUrl,
  path,
  headers = {},
) =>
  fetch(
    new URL(path, baseUrl),
    {
      redirect: "manual",
      cache: "no-store",
      headers,
      signal:
        AbortSignal.timeout(10_000),
    },
  );

const json = async (response) =>
  response
    .json()
    .catch(() => null);

try {
  let baseUrl;

  try {
    baseUrl = new URL(baseUrlText);
  } catch {
    throw Object.assign(
      new Error("invalid engine URL"),
      {
        code:
          "ENGINE_ORIGIN_URL_INVALID",
      },
    );
  }

  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.pathname !== "/" ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw Object.assign(
      new Error(
        "engine origin must be an HTTPS origin",
      ),
      {
        code:
          "ENGINE_ORIGIN_URL_NON_CANONICAL",
      },
    );
  }

  if (proxySecret.length < 32) {
    throw Object.assign(
      new Error(
        "proxy secret is missing",
      ),
      {
        code:
          "ENGINE_ORIGIN_PROXY_SECRET_INVALID",
      },
    );
  }

  const healthResponse =
    await request(
      baseUrl,
      "/health",
      {
        accept:
          "application/json",
      },
    );
  const health =
    await json(
      healthResponse,
    );

  if (
    !healthResponse.ok ||
    health?.status !== "ok" ||
    health?.service !==
      "puente-deca"
  ) {
    throw Object.assign(
      new Error(
        "engine liveness failed",
      ),
      {
        code:
          "ENGINE_ORIGIN_HEALTH_FAILED",
      },
    );
  }

  const readyResponse =
    await request(
      baseUrl,
      "/ready",
      {
        accept:
          "application/json",
      },
    );
  const ready =
    await json(
      readyResponse,
    );

  if (
    !readyResponse.ok ||
    ready?.status !==
      "ready" ||
    ready?.service !==
      "puente-deca" ||
    ready?.components?.metadata !==
      "ok" ||
    ready?.components?.artifacts !==
      "ok"
  ) {
    throw Object.assign(
      new Error(
        "engine readiness failed",
      ),
      {
        code:
          "ENGINE_ORIGIN_READY_FAILED",
      },
    );
  }

  const probePath =
    "/deca/d/__pdeca_engine_origin_probe_never_persist_20261003.pdf";

  const directResponse =
    await request(
      baseUrl,
      probePath,
      {
        accept:
          "application/json",
      },
    );
  const direct =
    await json(
      directResponse,
    );

  if (
    directResponse.status !== 401 ||
    direct?.error !==
      "unauthorized"
  ) {
    throw Object.assign(
      new Error(
        "engine public origin is not protected",
      ),
      {
        code:
          "ENGINE_ORIGIN_PUBLIC_BYPASS",
      },
    );
  }

  const proxyResponse =
    await request(
      baseUrl,
      probePath,
      {
        accept:
          "application/json",
        "x-kairoseth-public-proxy-secret":
          proxySecret,
      },
    );
  const proxy =
    await json(
      proxyResponse,
    );

  if (
    proxyResponse.status !== 404 ||
    proxy?.error !==
      "document_not_found"
  ) {
    throw Object.assign(
      new Error(
        "authenticated public proxy path did not reach storage",
      ),
      {
        code:
          "ENGINE_ORIGIN_PROXY_PATH_FAILED",
      },
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check:
          "engine-origin-smoke",
        origin:
          baseUrl.origin,
        liveness: true,
        readiness: {
          metadata: true,
          artifacts: true,
        },
        directPublicOriginBlocked:
          true,
        authenticatedProxyPath:
          true,
        probeCreatedData:
          false,
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  fail(
    typeof error?.code ===
      "string"
      ? error.code
      : "ENGINE_ORIGIN_SMOKE_FAILED",
  );
}
