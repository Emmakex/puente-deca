import {
  renderWinAnsiDecaPdf
} from "./pdf-winansi.mjs";
import {
  renderUnicodeDecaPdf
} from "./pdf-unicode.mjs";

export const MAX_DECA_PDF_BYTES =
  5_000_000;

export function requiresUnicodePdfEmbedding(
  snapshot
) {
  const serialized =
    JSON.stringify(snapshot ?? {});

  for (
    const character of
    serialized.normalize("NFC")
  ) {
    if (
      character.codePointAt(0) >
      0xff
    ) {
      return true;
    }
  }

  return false;
}

export async function renderNativeDecaPdf(
  snapshot,
  options = {}
) {
  if (
    requiresUnicodePdfEmbedding(
      snapshot
    )
  ) {
    return renderUnicodeDecaPdf(
      snapshot,
      options
    );
  }

  return renderWinAnsiDecaPdf(
    snapshot,
    options
  );
}
