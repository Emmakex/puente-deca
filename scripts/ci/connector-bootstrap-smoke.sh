#!/usr/bin/env bash
set -euo pipefail

if ! command -v php >/dev/null 2>&1; then
  echo "PHP is required for connector bootstrap acceptance." >&2
  exit 1
fi

PHP_VERSION="$(php -r 'echo PHP_VERSION;')"
echo "Connector bootstrap PHP runtime: ${PHP_VERSION}"

php -d display_errors=1 -d error_reporting=E_ALL   scripts/ci/php/woocommerce-bootstrap-smoke.php

for version in 1.7.8.0 8.1.2; do
  php -d display_errors=1 -d error_reporting=E_ALL     scripts/ci/php/prestashop-bootstrap-smoke.php "$version"
done

echo "Connector PHP bootstrap acceptance passed."
