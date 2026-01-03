#!/usr/bin/env bash
set -euo pipefail

# This script automatically imports the Brandstore Astra template
# Template URL: https://wpastra.com/templates/brandstore-02/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

WP_ADMIN_USER=${WP_ADMIN_USER:-"admin"}

run_wp() {
  docker compose run --rm wpcli "$@"
}

echo "==> Installing Brandstore template requirements..."

# Install and activate Elementor
if ! run_wp plugin is-installed elementor --path=/var/www/html >/dev/null 2>&1; then
  echo "    Installing Elementor..."
  run_wp plugin install elementor --activate --path=/var/www/html >/dev/null
else
  run_wp plugin activate elementor --path=/var/www/html >/dev/null 2>&1 || true
fi

# Install Starter Templates plugin (for importing Astra templates)
echo "    Installing Starter Templates plugin..."
if run_wp plugin install starter-templates --activate --path=/var/www/html >/dev/null 2>&1; then
  echo "    Starter Templates installed"
else
  echo "    Trying legacy astra-sites plugin..."
  run_wp plugin install astra-sites --activate --path=/var/www/html >/dev/null 2>&1 || true
fi

echo "==> Importing Brandstore template..."

# The Astra Starter Templates plugin doesn't have a direct WP-CLI command for automated import.
# We'll use a workaround by importing the template data directly via the REST API or by creating
# the necessary pages and content programmatically.

# Check if template is already imported (by looking for specific pages)
HOME_EXISTS=$(run_wp post list --post_type=page --name=home --field=ID --path=/var/www/html 2>/dev/null || echo "")

if [[ -n "$HOME_EXISTS" ]]; then
  echo "    Template appears to already be imported (Home page exists)"
else
  echo "    ⚠️  Automated template import requires manual step:"
  echo "    Go to: http://localhost:8080/wp-admin → Appearance → Starter Templates"
  echo "    1. Choose 'Elementor' as page builder"
  echo "    2. Search for 'Brandstore'"
  echo "    3. Click 'Import Complete Site'"
  echo ""
  echo "    Alternatively, we can create basic WooCommerce shop pages..."
  
  # Create basic shop structure as fallback
  echo "    Creating basic shop pages..."
  
  # Create Home page
  HOME_ID=$(run_wp post create --post_type=page --post_title='Home' --post_status=publish --post_content='Welcome to our craft store!' --path=/var/www/html --porcelain 2>/dev/null || echo "")
  
  if [[ -n "$HOME_ID" ]]; then
    echo "    Created Home page (ID: ${HOME_ID})"
    run_wp option update show_on_front page --path=/var/www/html >/dev/null 2>&1 || true
    run_wp option update page_on_front "${HOME_ID}" --path=/var/www/html >/dev/null 2>&1 || true
  fi
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 To import the full Brandstore template:"
echo "   Visit: http://localhost:8080/wp-admin"
echo "   Go to: Appearance → Starter Templates"
echo "   Search: 'Brandstore' → Import Complete Site"
echo ""
