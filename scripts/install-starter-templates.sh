#!/usr/bin/env bash
set -euo pipefail

# This script installs Elementor and the Starter Templates plugin
# so you can import the "Kate Stone – Designer Bio 02" Astra template.
#
# Usage:
#   bash scripts/install-starter-templates.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

echo "==> Ensuring containers are running..."
docker compose up -d

echo "==> Waiting for WordPress to be ready (15 seconds)..."
sleep 15

run_wp() {
  docker compose run --rm wpcli "$@"
}

install_or_activate() {
  local slug="$1"
  if run_wp plugin is-installed "${slug}" --path=/var/www/html >/dev/null 2>&1; then
    echo "    Activating plugin: ${slug}"
    run_wp plugin activate "${slug}" --path=/var/www/html >/dev/null || true
  else
    echo "    Installing plugin: ${slug}"
    run_wp plugin install "${slug}" --activate --path=/var/www/html >/dev/null
  fi
}

echo "==> Installing page builder and starter templates"
install_or_activate elementor

# Starter Templates plugin was historically "astra-sites"; the current slug is "starter-templates".
# Try the current slug first, then fall back to the legacy one if needed.
if run_wp plugin install starter-templates --activate --path=/var/www/html >/dev/null 2>&1; then
  echo "    Installed starter-templates"
else
  echo "    'starter-templates' not available from API, trying 'astra-sites'..."
  install_or_activate astra-sites
fi

echo ""
echo "✅ Plugins installed and activated."
echo ""
echo "Next steps to import the Kate Stone template (Elementor):"
echo "  1) Open: http://localhost:8080/wp-admin"
echo "  2) Go to Appearance → Starter Templates"
echo "  3) Choose Page Builder: Elementor"
echo "  4) Search for: 'Kate Stone' (Designer Bio 02)"
echo "  5) Click 'Import Complete Site' (or import individual templates)"
echo ""
echo "Tip: After import, go to Settings → Reading to set the imported home page as front page,"
echo "     and Appearance → Menus to assign the primary menu if needed."

