#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${1:-$ROOT/dist}"
STAGE="$(mktemp -d)"
WOO_VERSION="0.1.2"
PRESTA_VERSION="0.1.1"

cleanup() {
  rm -rf "$STAGE"
}
trap cleanup EXIT

mkdir -p "$OUT_DIR"
rm -f \
  "$OUT_DIR/puente-deca-woocommerce-${WOO_VERSION}.zip" \
  "$OUT_DIR/puentedeca-prestashop-${PRESTA_VERSION}.zip" \
  "$OUT_DIR/SHA256SUMS"

copy_woocommerce() {
  local target="$STAGE/puente-deca-woocommerce"
  mkdir -p "$target/includes"

  cp \
    "$ROOT/connectors/woocommerce/puente-deca-woocommerce.php" \
    "$target/"

  cp \
    "$ROOT/connectors/woocommerce/includes/"*.php \
    "$target/includes/"
}

copy_prestashop() {
  local target="$STAGE/puentedeca"
  mkdir -p "$target/classes" "$target/upgrade"

  cp \
    "$ROOT/connectors/prestashop/puentedeca.php" \
    "$target/"

  cp \
    "$ROOT/connectors/prestashop/classes/"*.php \
    "$target/classes/"

  cp \
    "$ROOT/connectors/prestashop/upgrade/"*.php \
    "$target/upgrade/"
}

normalize_timestamps() {
  find "$STAGE" -exec touch -t 198001010000 {} +
}

make_zip() {
  local folder="$1"
  local destination="$2"

  (
    cd "$STAGE"
    find "$folder" -type f -print \
      | LC_ALL=C sort \
      | zip -X -q "$destination" -@
  )
}

copy_woocommerce
copy_prestashop
normalize_timestamps

make_zip \
  "puente-deca-woocommerce" \
  "$OUT_DIR/puente-deca-woocommerce-${WOO_VERSION}.zip"

make_zip \
  "puentedeca" \
  "$OUT_DIR/puentedeca-prestashop-${PRESTA_VERSION}.zip"

(
  cd "$OUT_DIR"
  sha256sum \
    "puente-deca-woocommerce-${WOO_VERSION}.zip" \
    "puentedeca-prestashop-${PRESTA_VERSION}.zip" \
    > SHA256SUMS
)

printf 'Created reproducible connector packages in %s\n' "$OUT_DIR"
cat "$OUT_DIR/SHA256SUMS"
