#!/usr/bin/env bash
set -eu

# This script runs INSIDE the wpcli container
# It should NOT call docker compose

WP_PATH=${WP_PATH:-/var/www/html}
WP_URL=${WP_URL:-"http://localhost:8080"}
WP_TITLE=${WP_TITLE:-"Myriam Craft Store"}
WP_ADMIN_USER=${WP_ADMIN_USER:-"admin"}
WP_ADMIN_PASSWORD=${WP_ADMIN_PASSWORD:-"change-me"}
WP_ADMIN_EMAIL=${WP_ADMIN_EMAIL:-"admin@example.com"}
WP_SHOP_USER=${WP_SHOP_USER:-"myriam"}
WP_SHOP_PASSWORD=${WP_SHOP_PASSWORD:-"change-me"}
WP_SHOP_EMAIL=${WP_SHOP_EMAIL:-"myriam@example.com"}

run_wp() {
  wp --path="${WP_PATH}" "$@"
}

echo "==> Waiting for WordPress files..."
for _ in {1..60}; do
  if [[ -f "${WP_PATH}/wp-config.php" ]]; then
    break
  fi
  sleep 2
done

echo "==> Checking WordPress installation"
if run_wp core is-installed >/dev/null 2>&1; then
  echo "    WordPress already installed."
else
  echo "    Installing WordPress core..."
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
  if run_wp plugin is-installed "${slug}" >/dev/null 2>&1; then
    run_wp plugin activate "${slug}" >/dev/null || true
  else
    run_wp plugin install "${slug}" --activate >/dev/null
  fi
}

# Core plugins
install_or_activate woocommerce
install_or_activate wordpress-seo
install_or_activate wordfence

# Try WP Rocket; if not available, install a placeholder cache plugin
if run_wp plugin install wp-rocket --activate >/dev/null 2>&1; then
  echo "    Installed WP Rocket."
else
  echo "    WP Rocket not available; installing wp-super-cache as placeholder."
  install_or_activate wp-super-cache
fi

echo "==> Setting and activating theme: Astra"
if run_wp theme is-installed astra >/dev/null 2>&1; then
  run_wp theme activate astra >/dev/null
else
  run_wp theme install astra --activate >/dev/null
fi

echo "==> Installing page builder and starter templates"
install_or_activate elementor

# Starter Templates (Astra)
if run_wp plugin install starter-templates --activate >/dev/null 2>&1; then
  echo "    Installed starter-templates"
else
  echo "    'starter-templates' not available; trying legacy 'astra-sites'"
  install_or_activate astra-sites
fi

echo "==> Creating users if needed"
# Ensure admin user exists
if run_wp user get "${WP_ADMIN_USER}" >/dev/null 2>&1; then
  run_wp user update "${WP_ADMIN_USER}" --role=administrator --user_pass="${WP_ADMIN_PASSWORD}" >/dev/null
else
  run_wp user create "${WP_ADMIN_USER}" "${WP_ADMIN_EMAIL}" --role=administrator --user_pass="${WP_ADMIN_PASSWORD}" >/dev/null
fi

# Create shop manager user
if run_wp user get "${WP_SHOP_USER}" >/dev/null 2>&1; then
  run_wp user update "${WP_SHOP_USER}" --role=shop_manager --user_pass="${WP_SHOP_PASSWORD}" >/dev/null
else
  run_wp user create "${WP_SHOP_USER}" "${WP_SHOP_EMAIL}" --role=shop_manager --user_pass="${WP_SHOP_PASSWORD}" >/dev/null
fi

echo "==> Configure permalinks for clean URLs"
run_wp rewrite structure '/%postname%/' --hard >/dev/null
run_wp rewrite flush --hard >/dev/null

echo "==> Ensure WooCommerce pages and DB tables"
if run_wp help wc >/dev/null 2>&1; then
  run_wp wc tool run install_pages --user="${WP_ADMIN_USER}" >/dev/null || true
fi

# If WooCommerce DB not initialized, trigger installer
if ! run_wp option get woocommerce_db_version >/dev/null 2>&1; then
  run_wp eval 'if (class_exists("\\WC_Install")) { \\WC_Install::install(); echo "WC tables installed"; }' >/dev/null || true
fi

echo "==> Setting up Brandstore-style shop template"
run_wp eval-file /scripts/auto-import-brandstore.php 2>&1 | grep -E "^(Success:|Error:|Creating|Ã¢Å“â€¦)" || true

echo ""
echo "==> All set!"
echo "WordPress URL: ${WP_URL}"
echo "Admin: ${WP_ADMIN_USER} / ${WP_ADMIN_PASSWORD}"
echo "Shop Manager: ${WP_SHOP_USER} / ${WP_SHOP_PASSWORD}"
