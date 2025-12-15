#!/bin/bash

echo "📦 Adding sample products with images..."

# Get category IDs
JEWELRY_ID=$(docker compose run --rm wpcli wc product_cat list --slug="jewelry" --user=1 --field=id | head -1)
DECORATIONS_ID=$(docker compose run --rm wpcli wc product_cat list --slug="decorations" --user=1 --field=id | head -1)
TEXTILES_ID=$(docker compose run --rm wpcli wc product_cat list --slug="textiles" --user=1 --field=id | head -1)
POTTERY_ID=$(docker compose run --rm wpcli wc product_cat list --slug="pottery" --user=1 --field=id | head -1)

echo "Adding Sterling Silver Necklace..."
P1=$(docker compose run --rm wpcli wc product create \
  --name="Sterling Silver Moonstone Necklace" \
  --regular_price="125.00" \
  --description="Delicate sterling silver necklace featuring a genuine moonstone pendant. Chain length: 18 inches." \
  --manage_stock=true \
  --stock_quantity=12 \
  --sku="JEW-001" \
  --categories="[{\"id\":$JEWELRY_ID}]" \
  --user=1 \
  --porcelain 2>&1 | tail -1)
docker compose run --rm wpcli media import "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800" --post_id=$P1 --featured_image --user=1 2>/dev/null
echo "✅ Product $P1 created"

echo "Adding Ceramic Tea Set..."
P2=$(docker compose run --rm wpcli wc product create \
  --name="Ceramic Tea Set - Blue Glaze" \
  --regular_price="89.99" \
  --description="Elegant handcrafted ceramic tea set featuring a stunning blue glaze finish. Includes teapot and 4 cups." \
  --manage_stock=true \
  --stock_quantity=5 \
  --sku="POT-001" \
  --categories="[{\"id\":$POTTERY_ID}]" \
  --user=1 \
  --porcelain 2>&1 | tail -1)
docker compose run --rm wpcli media import "https://images.unsplash.com/photo-1587217241792-8f4b8bc4ed1a?w=800" --post_id=$P2 --featured_image --user=1 2>/dev/null
echo "✅ Product $P2 created"

echo "Adding Linen Cushion..."
P3=$(docker compose run --rm wpcli wc product create \
  --name="Hand-Embroidered Linen Cushion" \
  --regular_price="35.50" \
  --description="Beautiful linen cushion cover with hand-embroidered floral patterns. Made from 100% natural linen." \
  --manage_stock=true \
  --stock_quantity=15 \
  --sku="TEX-001" \
  --categories="[{\"id\":$TEXTILES_ID}]" \
  --user=1 \
  --porcelain 2>&1 | tail -1)
docker compose run --rm wpcli media import "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=800" --post_id=$P3 --featured_image --user=1 2>/dev/null
echo "✅ Product $P3 created"

echo "Adding Macrame Wall Hanging..."
P4=$(docker compose run --rm wpcli wc product create \
  --name="Handwoven Macrame Wall Hanging" \
  --regular_price="45.99" \
  --description="Beautiful handwoven macrame wall hanging made with natural cotton rope. Perfect for adding a bohemian touch to any room." \
  --manage_stock=true \
  --stock_quantity=8 \
  --sku="DECO-001" \
  --categories="[{\"id\":$DECORATIONS_ID}]" \
  --user=1 \
  --porcelain 2>&1 | tail -1)
docker compose run --rm wpcli media import "https://images.unsplash.com/photo-1600494603989-9650cf6ddd3d?w=800" --post_id=$P4 --featured_image --user=1 2>/dev/null
echo "✅ Product $P4 created"

echo ""
echo "🎉 Sample products added successfully!"
echo "Visit http://localhost:8080 to see your shop"
