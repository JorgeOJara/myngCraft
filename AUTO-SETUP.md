# Automatic Setup Guide

## Overview
This WordPress installation now features **automatic setup** that runs when you start Docker Compose for the first time.

## How It Works

When you run `docker compose up -d`, the setup process automatically:

1. ✅ Installs WordPress core
2. ✅ Installs and activates essential plugins:
   - WooCommerce
   - Yoast SEO
   - Wordfence Security
   - WP Super Cache
3. ✅ Installs and activates Astra theme
4. ✅ Installs Elementor page builder
5. ✅ Installs Starter Templates plugin
6. ✅ Creates admin and shop manager users
7. ✅ Configures permalinks
8. ✅ Sets up WooCommerce pages
9. ✅ **Creates Brandstore-style shop structure**:
   - Home page with WooCommerce blocks
   - Shop, About, and Contact pages
   - Primary navigation menu
   - E-commerce optimized Astra theme settings

## Usage

### First Time Setup
```bash
docker compose up -d
```

That's it! Wait 2-3 minutes for the automatic setup to complete.

### Access Your Site
- **WordPress Site**: http://localhost:8080
- **Admin Panel**: http://localhost:8080/wp-admin
  - Username: `admin`
  - Password: `change-me`
- **Shop Manager**: `myriam` / `change-me`
- **phpMyAdmin**: http://localhost:8081

### Check Setup Progress
```bash
docker compose logs setup
```

## Changing the Default Template

To use a different Astra template instead of Brandstore:

### Method 1: Manual Import (Easiest)
1. Log in to WordPress admin
2. Go to **Appearance → Starter Templates**
3. Choose your page builder (Elementor)
4. Search for your desired template (e.g., "Fashion Store", "Kate Stone")
5. Click **Import Complete Site**

### Method 2: Modify Auto-Import Script
Edit `scripts/auto-import-brandstore.php` to customize:
- Page content
- Menu items
- Theme colors
- Shop structure

Example: Change the home page content by editing the `$home_content` variable in the script.

### Method 3: Replace the Setup Script
1. Edit `scripts/internal-setup.sh`
2. Modify the template import section (line 117)
3. Replace `/scripts/auto-import-brandstore.php` with your custom PHP script
4. Run `docker compose down -v` and `docker compose up -d` to test

## Rebuilding from Scratch

To completely reset and run setup again:

```bash
# Stop and remove everything (including data)
docker compose down -v

# Start fresh
docker compose up -d
```

**Warning**: This will delete all WordPress data, posts, and uploads!

## Manual Setup (If Needed)

If you prefer to run setup manually:

```bash
# Run the setup script
bash scripts/setup.sh

# Or use the internal script directly
docker compose run --rm wpcli bash /scripts/internal-setup.sh
```

## Skipping Auto-Setup

The setup container automatically detects if WordPress is already installed. If you want to prevent auto-setup:

1. Remove the `setup` service from `docker-compose.yml`, or
2. Comment out the setup service in `docker-compose.yml`

## Customizing Default Settings

Edit `.env` file to customize:

```env
WP_TITLE="Your Store Name"
WP_ADMIN_USER=youradmin
WP_ADMIN_PASSWORD=your-secure-password
WP_ADMIN_EMAIL=your@email.com
WP_SHOP_USER=shopmanager
WP_SHOP_PASSWORD=shop-password
```

Changes take effect on next fresh install (after `docker compose down -v`).

## Troubleshooting

### Setup didn't run
```bash
# Check logs
docker compose logs setup

# Manually trigger setup
docker compose restart setup
```

### Setup stuck or failed
```bash
# View detailed logs
docker compose logs -f setup

# Reset and try again
docker compose down -v
docker compose up -d
```

### WordPress already installed message
This is normal! It means setup already ran. The setup only runs once automatically.

## Files Involved

- `docker-compose.yml` - Contains the `setup` service definition
- `scripts/internal-setup.sh` - Main setup script (runs inside container)
- `scripts/auto-import-brandstore.php` - Template structure creation
- `.env` - Configuration variables

## Notes

- ⚠️ Default passwords are insecure! Change them after first login.
- 📝 The setup is idempotent - safe to run multiple times
- 🔄 Setup runs automatically only on first startup
- 💾 Data persists in Docker volumes between restarts
