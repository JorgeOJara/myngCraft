# Myriam Craft Store - Quick Start Guide

## ✅ Your E-commerce Shop is Ready!

Your WordPress + WooCommerce + Astra theme shop is now running!

## 🌐 Access Your Shop

- **Storefront:** http://localhost:8080
- **Admin Panel:** http://localhost:8080/wp-admin
- **phpMyAdmin:** http://localhost:8081

## 🔑 Login Credentials

**Admin Account:**
- Username: `admin`
- Password: `123`

**Shop Manager:**
- Username: `myriam`
- Password: `123`

## 📦 Adding Products

### Method 1: Via WP-CLI (Command Line)

```bash
docker compose run --rm wpcli wc product create \
  --name="Your Product Name" \
  --regular_price="29.99" \
  --description="Product description" \
  --manage_stock=true \
  --stock_quantity=10 \
  --user=1
```

### Method 2: Via WordPress Admin (Easiest)

1. Go to http://localhost:8080/wp-admin
2. Login with admin / 123
3. Navigate to **Products → Add New**
4. Fill in:
   - Product name
   - Description
   - Regular price
   - Product image (upload from your computer)
   - Categories
   - Inventory (stock quantity)
5. Click **Publish**

## 🖼️ Adding Product Images

Since direct URL imports don't work well, use one of these methods:

### Via Admin Panel (Recommended):
1. Go to Products → All Products
2. Click on a product
3. In the "Product image" section, click "Set product image"
4. Upload an image from your computer
5. Click "Update"

### Via Media Library:
1. Go to Media → Library
2. Click "Add New"
3. Upload your product images
4. Go to Products and assign images to products

## 🏷️ Product Categories

Your shop has these categories pre-configured:
- Jewelry
- Decorations
- Textiles
- Pottery
- Accessories

Add more categories at: **Products → Categories**

## 🎨 Customizing Your Shop

### Change Colors & Fonts:
1. Go to **Appearance → Customize**
2. Navigate to **Global → Colors**
3. Set your brand colors
4. Go to **Global → Typography** to change fonts

### Configure Shop Layout:
1. Go to **Appearance → Customize**
2. Navigate to **WooCommerce → Product Catalog**
3. Adjust:
   - Products per row
   - Products per page
   - Shop sidebar position

### Configure Product Pages:
1. Go to **Appearance → Customize**
2. Navigate to **WooCommerce → Product**
3. Adjust layout and image gallery settings

### Import an Astra Starter Template (Kate Stone)

If you want to use the "Kate Stone – Designer Bio 02" design (Elementor):

1. Install required plugins via script:
   - Run: `bash scripts/install-starter-templates.sh`
2. In WordPress Admin, go to: **Appearance → Starter Templates**
3. Choose **Elementor** as the page builder
4. Search for: `Kate Stone` (Designer Bio 02)
5. Click **Import Complete Site** (or import selected templates)
6. After import:
   - Set homepage at **Settings → Reading** (choose the imported Home page)
   - Assign menu at **Appearance → Menus** (set Primary)

## 💳 Setting Up Payment Methods

1. Go to **WooCommerce → Settings → Payments**
2. Enable and configure:
   - Cash on Delivery (already enabled)
   - Direct Bank Transfer (already enabled)
   - Stripe (install plugin)
   - PayPal (install plugin)

## 🚚 Configuring Shipping

1. Go to **WooCommerce → Settings → Shipping**
2. Click on "Shipping zones"
3. Add your shipping zones and methods
4. Set shipping costs

## 📝 Sample Product Template

When adding products, use this structure for consistency:

**Product Name:** Clear, descriptive name
**Price:** $XX.XX
**Short Description:** 1-2 sentence summary  
**Full Description:** 
- What it is
- Materials used
- Dimensions/size
- Special features
- Care instructions

**Categories:** Choose relevant category
**Tags:** handmade, craft-specific keywords
**SKU:** Unique code (e.g., JEW-001)
**Stock:** Quantity available

## 🛠️ Useful Commands

### Start the shop:
```bash
docker compose up -d
```

### Stop the shop:
```bash
docker compose down
```

### View logs:
```bash
docker compose logs -f wordpress
```

### Backup database:
```bash
docker compose exec db mysqldump -u wordpress -pwordpress wordpress > backup.sql
```

### Add a user:
```bash
docker compose run --rm wpcli user create newuser email@example.com --role=shop_manager
```

## 🐛 Troubleshooting

### Products not showing?
- Make sure they're published (not draft)
- Check they have a price set
- Verify they're assigned to a category

### Can't upload images?
- Check file type (use JPG or PNG)
- Try smaller file size (under 2MB)
- Check WordPress media settings

### Shop looks broken?
1. Go to **Settings → Permalinks**
2. Click "Save Changes" (don't change anything)
3. Clear your browser cache (Cmd+Shift+R or Ctrl+Shift+R)

### Container issues?
```bash
docker compose down
docker compose up -d
```

## 📚 Next Steps

1. ✅ Add your product images via WP Admin
2. ✅ Customize colors and fonts
3. ✅ Add more products
4. ✅ Set up real payment gateways (Stripe/PayPal)
5. ✅ Configure accurate shipping rates
6. ✅ Create privacy policy and terms pages
7. ✅ Test the checkout process
8. ✅ Set up SSL certificate before going live

## 💡 Pro Tips

- Use high-quality, square product images (at least 800x800px)
- Write detailed, engaging product descriptions
- Use all 5 category types to organize products
- Add product tags for better searchability
- Set up email notifications for orders
- Regularly backup your database
- Test checkout process from a customer's perspective

## 🎉 You're All Set!

Your e-commerce shop is ready to start selling. Add your products through the WordPress admin panel at http://localhost:8080/wp-admin and start customizing!

Need help? Check the [WooCommerce documentation](https://woocommerce.com/documentation/) or [Astra theme docs](https://wpastra.com/docs/).

**Happy Selling! 🛍️**
