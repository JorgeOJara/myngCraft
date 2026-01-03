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

echo "==> Installing page builder and starter templates"
# Elementor (required by the requested template)
install_or_activate elementor

# Starter Templates (Astra) — prefer current slug, fallback to legacy
if run_wp plugin install starter-templates --activate --path=/var/www/html >/dev/null 2>&1; then
  echo "    Installed starter-templates"
else
  echo "    'starter-templates' not available; trying legacy 'astra-sites'"
  install_or_activate astra-sites
fi

# Install WooCommerce Brands extension for better product organization
install_or_activate perfect-brands-for-woocommerce

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

echo ""
echo "==> Optional: Import Kate Stone template (Elementor)"
echo "Go to Appearance → Starter Templates → Choose Elementor → Search 'Kate Stone' → Import Complete Site."
echo "After import, we will try to set the Home page and Primary menu automatically."

# Best-effort: if a 'Home' page exists (from manual/template import), set it as the static homepage.
HOME_ID="$(run_wp post list --post_type=page --name=home --field=ID --path=/var/www/html 2>/dev/null || true)"
if [[ -z "$HOME_ID" ]]; then
  # Fallback: find by title 'Home'
  HOME_ID="$(run_wp db query "SELECT ID FROM wp_posts WHERE post_type='page' AND post_status='publish' AND post_title='Home' LIMIT 1;" --skip-column-names --path=/var/www/html 2>/dev/null || true)"
fi

if [[ -n "${HOME_ID}" ]]; then
  echo "==> Setting static front page to ID ${HOME_ID}"
  run_wp option update show_on_front page --path=/var/www/html >/dev/null || true
  run_wp option update page_on_front "${HOME_ID}" --path=/var/www/html >/dev/null || true
fi

# Best-effort: assign a Primary menu if one exists after import
PRIMARY_MENU_ID="$(run_wp menu list --fields=term_id,slug --format=csv --path=/var/www/html 2>/dev/null | awk -F, 'NR>1 && tolower($2) ~ /primary/ {print $1; exit}')"
if [[ -n "${PRIMARY_MENU_ID}" ]]; then
  echo "==> Assigning existing Primary menu to 'primary' location"
  run_wp menu location assign "${PRIMARY_MENU_ID}" primary --path=/var/www/html >/dev/null || true
else
  # Create a menu if none exists and attempt to assign
  echo "==> Creating and assigning Primary menu"
  MENU_ID="$(run_wp menu create "Primary" --path=/var/www/html 2>/dev/null || true)"
  run_wp menu location assign primary primary --path=/var/www/html >/dev/null || true
fi

echo "==> Setting up Brandstore-style shop template"
run_wp eval-file /scripts/auto-import-brandstore.php --path=/var/www/html 2>&1 | grep -v "^Warning:" || true
