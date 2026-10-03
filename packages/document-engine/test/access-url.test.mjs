import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDocumentAccessUrl
} from "../src/access-url.mjs";

test("builds a direct HTTPS PDF URL under the configured base path", () => {
  const url = buildDocumentAccessUrl({
    baseUrl: "https://deca.example.com/public",
    token: "abcdefghijklmnop1234567890"
  });

  assert.equal(
    url,
    "https://deca.example.com/public/d/abcdefghijklmnop1234567890.pdf"
  );
});

test("rejects non-HTTPS document URLs", () => {
  assert.throws(
    () =>
      buildDocumentAccessUrl({
        baseUrl: "http://deca.example.com",
        token: "abcdefghijklmnop1234567890"
      }),
    /HTTPS/
  );
});

test("rejects weak or malformed URL tokens", () => {
  assert.throws(
    () =>
      buildDocumentAccessUrl({
        baseUrl: "https://deca.example.com",
        token: "short"
      }),
    /token/
  );
});
