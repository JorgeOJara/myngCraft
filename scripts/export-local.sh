#!/bin/bash
set -e

# Export script for local development
# Creates backups of database and uploads for deployment to live server

DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="backups"

echo "🔄 Creating backup..."
mkdir -p "${BACKUP_DIR}"

# Export database
echo "📊 Exporting database..."
docker compose exec db mysqldump -u wordpress -pwordpress wordpress > "${BACKUP_DIR}/db-${DATE}.sql"

# Export uploads
echo "📸 Exporting uploads..."
docker compose exec wordpress tar -czf /tmp/uploads.tar.gz -C /var/www/html/wp-content uploads
docker compose cp wordpress:/tmp/uploads.tar.gz "${BACKUP_DIR}/uploads-${DATE}.tar.gz"

# Clean up temporary file
docker compose exec wordpress rm /tmp/uploads.tar.gz

echo ""
echo "✅ Backup created successfully!"
echo "   Database: ${BACKUP_DIR}/db-${DATE}.sql"
echo "   Uploads:  ${BACKUP_DIR}/uploads-${DATE}.tar.gz"
echo ""
echo "📦 To deploy to live server:"
echo "   1. Transfer these files to your server"
echo "   2. Run: bash scripts/import-live.sh ${DATE}"
