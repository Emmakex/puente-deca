import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const serviceUrlText =
  process.env.PUENTE_DECA_SERVICE_URL?.trim() ?? "";
const serviceSecret =
  process.env.PUENTE_DECA_SERVICE_SECRET?.trim() ?? "";
const organizationId =
  process.env.KAIROSETH_CARGO_ACCEPTANCE_ORGANIZATION_ID?.trim() ||
  "kairoseth-cargo-production-acceptance";
const apiKeyFile =
  process.env.KAIROSETH_CARGO_ACCEPTANCE_API_KEY_FILE?.trim() ?? "";
const publicOrigin =
  process.env.KAIROSETH_PUBLIC_PRODUCTION_URL?.trim() ||
  "https://kairoseth.com";

const fail = (code, message) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check: "kairoseth-cargo-acceptance-fixture",
      code,
      message,
    })}\n`,
  );
  process.exitCode = 1;
};

const jsonRequest = async (url, init, accepted = [200]) => {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null);

  if (!accepted.includes(response.status)) {
    const error = new Error(
      `Unexpected HTTP ${response.status} from ${new URL(url).pathname}`,
    );
    error.code = "UPSTREAM_HTTP_ERROR";
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return { response, body };
};

const serviceHeaders = () => ({
  accept: "application/json",
  "content-type": "application/json",
  "x-kairoseth-service-secret": serviceSecret,
  "x-kairoseth-organization-id": organizationId,
});

const bearerHeaders = (apiKey) => ({
  accept: "application/json",
  "content-type": "application/json",
  authorization: `Bearer ${apiKey}`,
});

const serviceUrl = (path) =>
  `${serviceUrlText.replace(/\/$/, "")}${path}`;

const shipmentPayload = {
  externalReference: "KAIROSETH-CARGO-PRODUCTION-ACCEPTANCE-V1",
  contractualShipper: {
    legalName: "Kairoseth Cargo QA Shipper SL",
    taxId: "B00000001",
    address: "Synthetic QA fixture - no customer data",
  },
  effectiveCarrier: {
    legalName: "Kairoseth Cargo QA Carrier SL",
    taxId: "B00000002",
  },
  route: {
    origin: "Madrid",
    destination: "Barcelona",
  },
  goods: {
    nature: "Synthetic QA cargo",
    weight: {
      value: 100,
      unit: "kg",
    },
  },
  transport: {
    date: "2026-10-05",
    vehicle: {
      tractorRegistration: "0000QAQ",
      trailerRegistration: null,
    },
    specialTrafficAuthorization: null,
  },
  observations:
    "Synthetic Kairoseth Cargo production acceptance fixture. No customer or production business data.",
};

const readExistingApiKey = async () => {
  try {
    const value = (await readFile(apiKeyFile, "utf8")).trim();
    return value.length >= 16 ? value : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const persistApiKey = async (apiKey) => {
  await mkdir(dirname(apiKeyFile), { recursive: true });
  await writeFile(apiKeyFile, `${apiKey}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(apiKeyFile, 0o600);
};

const apiKeyWorks = async (apiKey) => {
  try {
    const response = await fetch(serviceUrl("/v1/shipments?limit=1"), {
      headers: bearerHeaders(apiKey),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    return response.status === 200;
  } catch {
    return false;
  }
};

try {
  let parsedServiceUrl;
  let parsedPublicOrigin;
  try {
    parsedServiceUrl = new URL(serviceUrlText);
    parsedPublicOrigin = new URL(publicOrigin);
  } catch {
    throw Object.assign(new Error("Production URLs are invalid"), {
      code: "INVALID_PRODUCTION_URL",
    });
  }

  if (
    !["http:", "https:"].includes(parsedServiceUrl.protocol) ||
    parsedPublicOrigin.protocol !== "https:" ||
    parsedPublicOrigin.hostname !== "kairoseth.com" ||
    parsedPublicOrigin.pathname !== "/" ||
    parsedPublicOrigin.search ||
    parsedPublicOrigin.hash
  ) {
    throw Object.assign(new Error("Production URLs are not allowed"), {
      code: "NON_CANONICAL_PRODUCTION_URL",
    });
  }

  if (serviceSecret.length < 32) {
    throw Object.assign(
      new Error("PUENTE_DECA_SERVICE_SECRET is required"),
      { code: "MISSING_SERVICE_SECRET" },
    );
  }

  if (!apiKeyFile) {
    throw Object.assign(
      new Error(
        "KAIROSETH_CARGO_ACCEPTANCE_API_KEY_FILE is required so the dedicated secret is never printed",
      ),
      { code: "MISSING_API_KEY_FILE" },
    );
  }

  const validUntil = new Date(
    Date.now() + 180 * 24 * 60 * 60 * 1000,
  ).toISOString();

  await jsonRequest(
    serviceUrl("/v1/access/connectors"),
    {
      method: "PUT",
      headers: serviceHeaders(),
      body: JSON.stringify({ validUntil }),
    },
    [200],
  );

  let apiKey = await readExistingApiKey();
  let credentialId = null;
  let credentialReused = false;

  if (apiKey && (await apiKeyWorks(apiKey))) {
    credentialReused = true;
  } else {
    apiKey = null;
    const { body } = await jsonRequest(
      serviceUrl("/v1/credentials"),
      {
        method: "POST",
        headers: serviceHeaders(),
        body: JSON.stringify({
          name: "Kairoseth Cargo production acceptance",
          kind: "api",
          expiresAt: validUntil,
        }),
      },
      [201],
    );

    if (
      typeof body?.apiKey !== "string" ||
      body.apiKey.length < 16 ||
      typeof body?.credential?.credentialId !== "string"
    ) {
      throw Object.assign(
        new Error("Credential response was invalid"),
        { code: "INVALID_CREDENTIAL_RESPONSE" },
      );
    }

    apiKey = body.apiKey;
    credentialId = body.credential.credentialId;
    await persistApiKey(apiKey);
  }

  const { body: shipment } = await jsonRequest(
    serviceUrl("/v1/shipments"),
    {
      method: "POST",
      headers: {
        ...bearerHeaders(apiKey),
        "idempotency-key":
          "kairoseth-cargo-production-acceptance-v1",
      },
      body: JSON.stringify(shipmentPayload),
    },
    [200, 201],
  );

  if (typeof shipment?.shipmentId !== "string") {
    throw Object.assign(new Error("Shipment response was invalid"), {
      code: "INVALID_SHIPMENT_RESPONSE",
    });
  }

  const { body: generated } = await jsonRequest(
    serviceUrl(
      `/v1/shipments/${encodeURIComponent(shipment.shipmentId)}/deca`,
    ),
    {
      method: "POST",
      headers: bearerHeaders(apiKey),
    },
    [200, 201],
  );

  const publicPdfUrl = generated?.document?.accessUrl;
  if (typeof publicPdfUrl !== "string") {
    throw Object.assign(new Error("Generated DeCA URL was missing"), {
      code: "MISSING_PUBLIC_PDF_URL",
    });
  }

  const parsedPdfUrl = new URL(publicPdfUrl);
  if (
    parsedPdfUrl.protocol !== "https:" ||
    parsedPdfUrl.hostname !== "kairoseth.com" ||
    !/^\/deca\/d\/[A-Za-z0-9_-]{16,128}\.pdf$/.test(
      parsedPdfUrl.pathname,
    ) ||
    parsedPdfUrl.search ||
    parsedPdfUrl.hash
  ) {
    throw Object.assign(new Error("Generated DeCA URL was not canonical"), {
      code: "NON_CANONICAL_PUBLIC_PDF_URL",
    });
  }

  const pdfResponse = await fetch(parsedPdfUrl, {
    headers: { accept: "application/pdf" },
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });

  if (pdfResponse.status !== 200) {
    throw Object.assign(
      new Error(`Public DeCA returned HTTP ${pdfResponse.status}`),
      { code: "PUBLIC_PDF_HTTP_ERROR" },
    );
  }

  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  if (
    pdfBytes.length === 0 ||
    pdfBytes.length > 5_000_000 ||
    pdfBytes.subarray(0, 5).toString("latin1") !== "%PDF-"
  ) {
    throw Object.assign(new Error("Public DeCA PDF was invalid"), {
      code: "INVALID_PUBLIC_PDF",
    });
  }

  const pdfSha256 = `sha256:${createHash("sha256")
    .update(pdfBytes)
    .digest("hex")}`;

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check: "kairoseth-cargo-acceptance-fixture",
        organizationId,
        credentialReused,
        credentialId,
        apiKeyFile,
        shipmentId: shipment.shipmentId,
        publicPdfUrl,
        pdfSha256,
        githubActionsInputs: {
          KAIROSETH_CARGO_ACCEPTANCE_SHIPMENT_ID:
            shipment.shipmentId,
          KAIROSETH_CARGO_ACCEPTANCE_PUBLIC_PDF_URL:
            publicPdfUrl,
          KAIROSETH_CARGO_ACCEPTANCE_PDF_SHA256:
            pdfSha256,
        },
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  fail(
    typeof error?.code === "string"
      ? error.code
      : "ACCEPTANCE_FIXTURE_PROVISION_FAILED",
    error instanceof Error ? error.message : "Unknown error",
  );
}
