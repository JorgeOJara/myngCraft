# Deployment Guide - Local to Live Server

## Overview
This guide covers deploying your MyriamCraft store from local development to a live production server.

## Pre-Deployment Checklist

### 1. Local Setup Complete ✓
- [ ] WordPress installed with all plugins
- [ ] WooCommerce configured
- [ ] Astra theme with Brandstore template applied
- [ ] Products added with images
- [ ] Pages and menus configured
- [ ] Test orders completed successfully

### 2. Prepare for Production
- [ ] Update admin passwords to strong passwords
- [ ] Configure real payment gateways (Stripe, PayPal)
- [ ] Set up real shipping rates
- [ ] Add privacy policy and terms & conditions
- [ ] Configure email notifications (SMTP)
- [ ] Test checkout process thoroughly

## Deployment Strategy

### Option 1: Database Export/Import (Recommended for Initial Setup)

#### Step 1: Export Database Locally
```bash
# Create a backup of your local database
docker compose exec db mysqldump -u wordpress -pwordpress wordpress > myriamcraft-backup.sql

# Or use the backup script
docker compose exec db mysqldump -u wordpress -pwordpress wordpress > backup-$(date +%Y%m%d-%H%M%S).sql
```

#### Step 2: Export WordPress Uploads
```bash
# Copy uploads from Docker volume to local directory
docker compose cp wordpress:/var/www/html/wp-content/uploads ./uploads-backup

# Or create a tar archive
docker compose exec wordpress tar -czf /tmp/uploads.tar.gz -C /var/www/html/wp-content uploads
docker compose cp wordpress:/tmp/uploads.tar.gz ./uploads-backup.tar.gz
```

#### Step 3: Push Code to Git Repository
```bash
# Make sure .gitignore excludes sensitive files
git add .
git commit -m "Ready for production deployment

Co-Authored-By: Warp <agent@warp.dev>"
git push origin main
```

#### Step 4: Deploy on Live Server
```bash
# On your live server:
git clone <your-repo-url>
cd myriamCraft

# Copy your production .env file
cp .env.example .env

# Edit .env with production values:
# - Update WP_URL to your domain (https://yourdomain.com)
# - Use strong passwords
# - Update email addresses
nano .env
```

#### Step 5: Import Database on Live Server
```bash
# Copy the SQL backup to your server (using scp, sftp, or git)
# Then import it:
docker compose up -d db
docker compose exec -T db mysql -u wordpress -pwordpress wordpress < myriamcraft-backup.sql
```

#### Step 6: Update URLs in Database
```bash
# Update site URLs to production domain
docker compose run --rm wpcli search-replace 'http://localhost:8080' 'https://yourdomain.com' --all-tables

# Flush cache
docker compose run --rm wpcli cache flush
docker compose run --rm wpcli rewrite flush
```

#### Step 7: Import Uploads
```bash
# Copy uploads to the WordPress container
docker compose cp ./uploads-backup wordpress:/var/www/html/wp-content/uploads

# Or extract the tar archive
docker compose cp ./uploads-backup.tar.gz wordpress:/tmp/
docker compose exec wordpress tar -xzf /tmp/uploads.tar.gz -C /var/www/html/wp-content/
```

#### Step 8: Start All Services
```bash
docker compose up -d
```

### Option 2: Git-Only Deployment (For Updates After Initial Setup)

Once your site is live, for subsequent updates:

```bash
# Local: Commit changes
git add .
git commit -m "Update products and content

Co-Authored-By: Warp <agent@warp.dev>"
git push origin main

# Live Server: Pull changes
git pull origin main
docker compose restart wordpress
```

**Note:** This method only updates code/config, not database content or uploads.

## Production Configuration

### 1. Update .env for Production
```env
# Database (use strong passwords)
MYSQL_DATABASE=wordpress
MYSQL_USER=wordpress_prod
MYSQL_PASSWORD=<generate-strong-password>
MYSQL_ROOT_PASSWORD=<generate-strong-root-password>

# WordPress
WP_URL=https://yourdomain.com
WP_TITLE=Myriam Craft Store
WP_ADMIN_USER=admin
WP_ADMIN_PASSWORD=<generate-strong-password>
WP_ADMIN_EMAIL=your-real-email@domain.com
WP_SHOP_USER=myriam
WP_SHOP_PASSWORD=<generate-strong-password>
WP_SHOP_EMAIL=myriam@domain.com

# Ports (optional, use nginx reverse proxy in production)
HTTP_PORT=8080
```

### 2. Update Secret Files
```bash
# Create production secrets (IMPORTANT!)
echo "your-strong-mysql-password" > secrets/mysql_password.default
echo "your-strong-root-password" > secrets/mysql_root_password.default

# Set proper permissions
chmod 600 secrets/*
```

### 3. SSL/HTTPS Setup
Add a reverse proxy (nginx or Traefik) with SSL certificates:

```yaml
# Example nginx configuration (create nginx.conf)
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Important Notes

### What Gets Committed to Git
✅ **DO commit:**
- docker-compose.yml
- scripts/
- .env.example (template)
- .gitignore
- Documentation files
- Custom theme/plugin code

❌ **DO NOT commit:**
- .env (contains passwords)
- secrets/* (except .gitkeep)
- Database dumps
- wp-content/uploads (unless small)
- Docker volumes

### Database Considerations
- **Initial deployment:** Export/import full database
- **Content updates:** Can be done through WordPress admin on live site
- **Structure changes:** May need search-replace for URLs
- **Regular backups:** Set up automated database backups on live server

### File Uploads
- **Option 1:** Commit small images to git (in a `static-uploads/` folder)
- **Option 2:** Use rsync to sync uploads between local and live
- **Option 3:** After initial setup, manage uploads directly on live site
- **Option 4:** Use cloud storage (S3, Cloudflare R2) for production

### Best Practices

1. **Use Git for code only**, not data
2. **Backup database regularly** on live server
3. **Use strong passwords** in production
4. **Enable HTTPS** (Let's Encrypt or Cloudflare)
5. **Set up monitoring** (uptime, error logs)
6. **Test locally first**, then deploy
7. **Keep Docker images updated** (security)
8. **Use environment-specific configs** (.env)

## Sync Scripts

### Export Everything (Local)
```bash
#!/bin/bash
# export-local.sh
DATE=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

# Export database
docker compose exec db mysqldump -u wordpress -pwordpress wordpress > backups/db-${DATE}.sql

# Export uploads
docker compose exec wordpress tar -czf /tmp/uploads.tar.gz -C /var/www/html/wp-content uploads
docker compose cp wordpress:/tmp/uploads.tar.gz backups/uploads-${DATE}.tar.gz

echo "✅ Backup created: backups/db-${DATE}.sql and backups/uploads-${DATE}.tar.gz"
```

### Import Everything (Live Server)
```bash
#!/bin/bash
# import-live.sh
BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: ./import-live.sh <backup-date>"
    exit 1
fi

# Import database
docker compose exec -T db mysql -u wordpress -pwordpress wordpress < backups/db-${BACKUP_FILE}.sql

# Update URLs
docker compose run --rm wpcli search-replace 'http://localhost:8080' 'https://yourdomain.com' --all-tables

# Import uploads
docker compose cp backups/uploads-${BACKUP_FILE}.tar.gz wordpress:/tmp/
docker compose exec wordpress tar -xzf /tmp/uploads-${BACKUP_FILE}.tar.gz -C /var/www/html/wp-content/

# Restart
docker compose restart wordpress

echo "✅ Import complete!"
```

## Troubleshooting

### URLs Still Point to Localhost
```bash
docker compose run --rm wpcli search-replace 'localhost:8080' 'yourdomain.com' --all-tables
```

### Images Not Showing
```bash
# Check file permissions
docker compose exec wordpress chown -R www-data:www-data /var/www/html/wp-content/uploads
```

### Can't Access Admin Panel
```bash
# Reset admin password
docker compose run --rm wpcli user update admin --user_pass=new-password
```

## Quick Reference

### Daily Workflow
```bash
# Local development
docker compose up -d
# ... make changes ...
git add .
git commit -m "Update XYZ"
git push

# Live server (for code updates only)
git pull
docker compose restart wordpress
```

### Full Site Migration
```bash
# Local
bash export-local.sh

# Transfer files to server (scp, rsync, or commit to private git)
scp backups/* user@server:/path/to/myriamcraft/backups/

# Live server
bash import-live.sh 20260118-123000
```

---

## Next Steps After Deployment

1. ✅ Verify site loads at production URL
2. ✅ Test admin login
3. ✅ Check all pages and products display correctly
4. ✅ Test checkout process end-to-end
5. ✅ Configure payment gateways with live keys
6. ✅ Set up email (SMTP plugin or SendGrid)
7. ✅ Enable SSL/HTTPS
8. ✅ Set up automated backups
9. ✅ Configure CDN (optional: Cloudflare)
10. ✅ Monitor logs and performance

---

**Questions?** Check the WordPress admin at `https://yourdomain.com/wp-admin` or review logs with `docker compose logs -f wordpress`
