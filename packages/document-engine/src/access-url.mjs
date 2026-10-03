import { randomBytes } from "node:crypto";

export const createAccessToken = () =>
  randomBytes(24).toString("base64url");

export function buildDocumentAccessUrl({ baseUrl, token }) {
  if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
    throw new TypeError("baseUrl is required");
  }

  const parsed = new URL(baseUrl);

  if (parsed.protocol !== "https:") {
    throw new TypeError("DeCA document URLs must use HTTPS");
  }

  if (
    typeof token !== "string" ||
    !/^[A-Za-z0-9_-]{16,}$/.test(token)
  ) {
    throw new TypeError("A sufficiently strong URL token is required");
  }

  const root = parsed.href.endsWith("/") ? parsed : new URL(
    `${parsed.pathname.replace(/\/$/, "")}/`,
    parsed
  );

  return new URL(`d/${token}.pdf`, root).href;
}
