#!/bin/bash
set -e

# Import script for live server
# Imports database and uploads from local backup

BACKUP_DATE=$1
BACKUP_DIR="backups"

if [ -z "$BACKUP_DATE" ]; then
    echo "❌ Error: Backup date required"
    echo "Usage: ./scripts/import-live.sh <backup-date>"
    echo ""
    echo "Example: ./scripts/import-live.sh 20260118-120000"
    echo ""
    echo "Available backups:"
    ls -1 "${BACKUP_DIR}"/db-*.sql 2>/dev/null | sed 's/.*db-\(.*\)\.sql/  \1/' || echo "  No backups found"
    exit 1
fi

DB_FILE="${BACKUP_DIR}/db-${BACKUP_DATE}.sql"
UPLOADS_FILE="${BACKUP_DIR}/uploads-${BACKUP_DATE}.tar.gz"

# Check if files exist
if [ ! -f "$DB_FILE" ]; then
    echo "❌ Error: Database backup not found: $DB_FILE"
    exit 1
fi

if [ ! -f "$UPLOADS_FILE" ]; then
    echo "❌ Error: Uploads backup not found: $UPLOADS_FILE"
    exit 1
fi

echo "🚀 Starting import process..."
echo ""

# Import database
echo "📊 Importing database..."
docker compose exec -T db mysql -u wordpress -pwordpress wordpress < "$DB_FILE"

# Get production URL from .env
PROD_URL=$(grep "^WP_URL=" .env | cut -d'=' -f2 | tr -d '"' || echo "")

if [ -n "$PROD_URL" ]; then
    echo "🔄 Updating URLs to: $PROD_URL"
    docker compose run --rm wpcli search-replace 'http://localhost:8080' "$PROD_URL" --all-tables --skip-columns=guid
else
    echo "⚠️  Warning: WP_URL not set in .env, skipping URL replacement"
    echo "   You may need to run manually:"
    echo "   docker compose run --rm wpcli search-replace 'http://localhost:8080' 'https://yourdomain.com' --all-tables"
fi

# Import uploads
echo "📸 Importing uploads..."
docker compose cp "$UPLOADS_FILE" wordpress:/tmp/
docker compose exec wordpress tar -xzf /tmp/uploads.tar.gz -C /var/www/html/wp-content/
docker compose exec wordpress rm /tmp/uploads.tar.gz

# Fix permissions
echo "🔒 Setting proper permissions..."
docker compose exec wordpress chown -R www-data:www-data /var/www/html/wp-content/uploads

# Flush cache
echo "🧹 Flushing cache..."
docker compose run --rm wpcli cache flush 2>/dev/null || true
docker compose run --rm wpcli rewrite flush 2>/dev/null || true

# Restart services
echo "♻️  Restarting services..."
docker compose restart wordpress

echo ""
echo "✅ Import completed successfully!"
echo ""
echo "Next steps:"
echo "  1. Visit your site and verify everything works"
echo "  2. Login to wp-admin and check all content"
echo "  3. Test checkout process"
echo "  4. Update payment gateway settings with live credentials"
echo ""
