#!/bin/bash

echo "🚀 Setting up complete e-commerce shop..."

# Configure WooCommerce
echo "🛒 Configuring WooCommerce..."
docker compose run --rm wpcli wc tool run install_pages --user=1
docker compose run --rm wpcli option update woocommerce_currency "USD"
docker compose run --rm wpcli option update woocommerce_enable_guest_checkout "yes"
docker compose run --rm wpcli option update woocommerce_cart_redirect_after_add "no"

# Create categories
echo "📁 Creating product categories..."
docker compose run --rm wpcli wc product_cat create --name="Jewelry" --slug="jewelry" --user=1 2>/dev/null || true
docker compose run --rm wpcli wc product_cat create --name="Decorations" --slug="decorations" --user=1 2>/dev/null || true
docker compose run --rm wpcli wc product_cat create --name="Textiles" --slug="textiles" --user=1 2>/dev/null || true
docker compose run --rm wpcli wc product_cat create --name="Pottery" --slug="pottery" --user=1 2>/dev/null || true
docker compose run --rm wpcli wc product_cat create --name="Accessories" --slug="accessories" --user=1 2>/dev/null || true

# Create CORS fix plugin
echo "🔧 Installing CORS fix..."
docker compose exec -T wordpress bash << 'EOFPHP'
cat > /var/www/html/wp-content/plugins/fix-cors.php << 'EOFPLUG'
<?php
/**
 * Plugin Name: Fix CORS and Asset Loading
 * Version: 1.0
 */
function add_cors_headers() {
    header('Access-Control-Allow-Origin: *');
}
add_action('send_headers', 'add_cors_headers');
EOFPLUG
EOFPHP

docker compose run --rm wpcli plugin activate fix-cors --user=1

# Set permalinks
echo "🔗 Setting permalinks..."
docker compose run --rm wpcli rewrite structure '/%postname%/'

echo ""
echo "✅ Shop setup complete!"
echo ""
echo "Next: Run './scripts/add-sample-products.sh' to add products"
