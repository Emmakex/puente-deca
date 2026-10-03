import { createHash } from "node:crypto";

const urlText =
  process.env.DECA_SMOKE_PUBLIC_URL?.trim() ?? "";
const expectedSha =
  process.env.DECA_SMOKE_EXPECTED_SHA256?.trim() ?? "";

const fail = (code) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "error",
      check: "public-pdf-smoke",
      code
    })}\n`
  );
  process.exitCode = 1;
};

try {
  let url;
  try {
    url = new URL(urlText);
  } catch {
    throw Object.assign(
      new Error("invalid public URL"),
      { code: "INVALID_PUBLIC_URL" }
    );
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "kairoseth.com" ||
    !/^\/deca\/d\/[A-Za-z0-9_-]{16,128}\.pdf$/.test(
      url.pathname
    ) ||
    url.search ||
    url.hash
  ) {
    throw Object.assign(
      new Error("public URL is not canonical"),
      { code: "NON_CANONICAL_PUBLIC_URL" }
    );
  }

  if (
    !/^sha256:[a-f0-9]{64}$/.test(
      expectedSha
    )
  ) {
    throw Object.assign(
      new Error("expected SHA-256 is required"),
      { code: "INVALID_EXPECTED_SHA256" }
    );
  }

  const response = await fetch(url, {
    redirect: "manual",
    cache: "no-store",
    headers: {
      accept: "application/pdf"
    },
    signal: AbortSignal.timeout(15_000)
  });

  if (
    response.status < 200 ||
    response.status >= 300
  ) {
    throw Object.assign(
      new Error("public route did not return 2xx"),
      { code: "PUBLIC_ROUTE_HTTP_ERROR" }
    );
  }

  const contentType =
    response.headers
      .get("content-type")
      ?.toLowerCase() ?? "";

  if (
    !contentType.startsWith(
      "application/pdf"
    )
  ) {
    throw Object.assign(
      new Error("public route did not return PDF"),
      { code: "PUBLIC_ROUTE_NOT_PDF" }
    );
  }

  const declaredLength = Number(
    response.headers.get(
      "content-length"
    ) ?? "0"
  );

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > 5_000_000
  ) {
    throw Object.assign(
      new Error("public PDF is too large"),
      { code: "PUBLIC_PDF_SIZE_LIMIT" }
    );
  }

  const bytes = Buffer.from(
    await response.arrayBuffer()
  );

  if (bytes.length > 5_000_000) {
    throw Object.assign(
      new Error("public PDF is too large"),
      { code: "PUBLIC_PDF_SIZE_LIMIT" }
    );
  }

  if (
    bytes.subarray(0, 5).toString(
      "latin1"
    ) !== "%PDF-"
  ) {
    throw Object.assign(
      new Error("public body lacks PDF signature"),
      { code: "PUBLIC_PDF_SIGNATURE_INVALID" }
    );
  }

  const actualSha =
    `sha256:${createHash("sha256")
      .update(bytes)
      .digest("hex")}`;

  if (actualSha !== expectedSha) {
    throw Object.assign(
      new Error("public PDF checksum mismatch"),
      { code: "PUBLIC_PDF_SHA256_MISMATCH" }
    );
  }

  const cacheControl =
    response.headers.get(
      "cache-control"
    ) ?? "";
  const contentTypeOptions =
    response.headers.get(
      "x-content-type-options"
    ) ?? "";
  const referrerPolicy =
    response.headers.get(
      "referrer-policy"
    ) ?? "";
  const robots =
    response.headers.get(
      "x-robots-tag"
    ) ?? "";

  if (!/no-store/i.test(cacheControl)) {
    throw Object.assign(
      new Error("public PDF may be cached"),
      { code: "PUBLIC_PDF_CACHE_POLICY_INVALID" }
    );
  }

  if (
    contentTypeOptions.toLowerCase() !==
    "nosniff"
  ) {
    throw Object.assign(
      new Error("nosniff header missing"),
      { code: "PUBLIC_PDF_NOSNIFF_MISSING" }
    );
  }

  if (
    referrerPolicy.toLowerCase() !==
    "no-referrer"
  ) {
    throw Object.assign(
      new Error("no-referrer header missing"),
      { code: "PUBLIC_PDF_REFERRER_POLICY_INVALID" }
    );
  }

  if (!/noindex/i.test(robots)) {
    throw Object.assign(
      new Error("noindex header missing"),
      { code: "PUBLIC_PDF_ROBOTS_POLICY_INVALID" }
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        check: "public-pdf-smoke",
        origin: url.origin,
        pathClass:
          "/deca/d/<opaque-token>.pdf",
        bytes: bytes.length,
        sha256Matched: true,
        directPdf: true,
        noStore: true,
        noSniff: true,
        noReferrer: true,
        noIndex: true
      },
      null,
      2
    )}\n`
  );
} catch (error) {
  fail(
    typeof error?.code === "string"
      ? error.code
      : "PUBLIC_PDF_SMOKE_FAILED"
  );
}
