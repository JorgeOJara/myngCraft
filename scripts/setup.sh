#!/usr/bin/env bash
set -euo pipefail

# Change to project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

# Configuration (override via env or .env)
WP_URL=${WP_URL:-"http://localhost:8080"}
WP_TITLE=${WP_TITLE:-"Myriam Craft Store"}
WP_ADMIN_USER=${WP_ADMIN_USER:-"admin"}
WP_ADMIN_PASSWORD=${WP_ADMIN_PASSWORD:-"123"}
WP_ADMIN_EMAIL=${WP_ADMIN_EMAIL:-"admin@example.com"}
WP_SHOP_USER=${WP_SHOP_USER:-"myriam"}
WP_SHOP_PASSWORD=${WP_SHOP_PASSWORD:-"123"}
WP_SHOP_EMAIL=${WP_SHOP_EMAIL:-"myriam@example.com"}

# Load DB creds from .env if present (so we can wait on DB root ping)
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi

echo "==> Ensuring containers are running..."
docker compose up -d

echo "==> Waiting for services to be ready (15 seconds)..."
sleep 15

run_wp() {
  docker compose run --rm wpcli "$@"
}

echo "==> Ensuring WordPress core is installed"
if run_wp core is-installed --path=/var/www/html >/dev/null 2>&1; then
  echo "    WordPress already installed."
else
  run_wp core install \
    --url="${WP_URL}" \
    --title="${WP_TITLE}" \
    --admin_user="${WP_ADMIN_USER}" \
    --admin_password="${WP_ADMIN_PASSWORD}" \
    --admin_email="${WP_ADMIN_EMAIL}" \
    --skip-email
fi

echo "==> Installing and activating required plugins"

install_or_activate() {
  local slug="$1"
  if run_wp plugin is-installed "${slug}" --path=/var/www/html >/dev/null 2>&1; then
    run_wp plugin activate "${slug}" --path=/var/www/html >/dev/null || true
  else
    run_wp plugin install "${slug}" --activate --path=/var/www/html >/dev/null
  fi
}

# Core set
install_or_activate woocommerce
install_or_activate wordpress-seo
install_or_activate wordfence

# Try WP Rocket; if not available, install a placeholder cache plugin
if run_wp plugin install wp-rocket --activate --path=/var/www/html >/dev/null 2>&1; then
  echo "    Installed WP Rocket."
else
  echo "    WP Rocket not available; installing wp-super-cache as placeholder."
  install_or_activate wp-super-cache
fi

echo "==> Setting and activating theme: Astra"
if run_wp theme is-installed astra --path=/var/www/html >/dev/null 2>&1; then
  run_wp theme activate astra --path=/var/www/html >/dev/null
else
  run_wp theme install astra --activate --path=/var/www/html >/dev/null
fi

echo "==> Creating users if needed"
# Ensure admin user exists and has administrator role
if run_wp user get "${WP_ADMIN_USER}" --path=/var/www/html >/dev/null 2>&1; then
  run_wp user update "${WP_ADMIN_USER}" --role=administrator --user_pass="${WP_ADMIN_PASSWORD}" --path=/var/www/html >/dev/null
else
  run_wp user create "${WP_ADMIN_USER}" "${WP_ADMIN_EMAIL}" --role=administrator --user_pass="${WP_ADMIN_PASSWORD}" --path=/var/www/html >/dev/null
fi

# Create shop manager user
if run_wp user get "${WP_SHOP_USER}" --path=/var/www/html >/dev/null 2>&1; then
  run_wp user update "${WP_SHOP_USER}" --role=shop_manager --user_pass="${WP_SHOP_PASSWORD}" --path=/var/www/html >/dev/null
else
  run_wp user create "${WP_SHOP_USER}" "${WP_SHOP_EMAIL}" --role=shop_manager --user_pass="${WP_SHOP_PASSWORD}" --path=/var/www/html >/dev/null
fi

echo "==> Configure permalinks for clean URLs"
run_wp rewrite structure '/%postname%/' --hard --path=/var/www/html >/dev/null
run_wp rewrite flush --hard --path=/var/www/html >/dev/null

echo "==> Ensure WooCommerce pages and DB tables"
# Install WooCommerce pages (Shop, Cart, Checkout, My Account)
if run_wp help wc >/dev/null 2>&1; then
  run_wp wc tool run install_pages --user="${WP_ADMIN_USER}" --path=/var/www/html >/dev/null || true
fi

# If WooCommerce DB not initialized, trigger installer
if ! run_wp option get woocommerce_db_version --path=/var/www/html >/dev/null 2>&1; then
  run_wp eval $'if (class_exists("\\\\WC_Install")) { \\\\WC_Install::install(); echo "WC tables installed"; }' --path=/var/www/html >/dev/null || true
fi

echo "==> All set!"
echo "WordPress URL: ${WP_URL}"
echo "Admin: ${WP_ADMIN_USER} / ${WP_ADMIN_PASSWORD}"
echo "Shop Manager: ${WP_SHOP_USER} / ${WP_SHOP_PASSWORD}"
echo "phpMyAdmin: http://localhost:8081 (host: db, user: ${MYSQL_USER:-wordpress})"
