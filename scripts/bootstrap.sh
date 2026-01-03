#!/usr/bin/env bash
set -euo pipefail

WP_PATH=${WP_PATH:-/var/www/html}
WP_URL=${WP_URL:-"http://localhost:8080"}
WP_TITLE=${WP_TITLE:-"Myriam Craft Store"}
WP_ADMIN_USER=${WP_ADMIN_USER:-"admin"}
WP_ADMIN_PASSWORD=${WP_ADMIN_PASSWORD:-"change-me"}
WP_ADMIN_EMAIL=${WP_ADMIN_EMAIL:-"admin@example.com"}
WP_SHOP_USER=${WP_SHOP_USER:-"myriam"}
WP_SHOP_PASSWORD=${WP_SHOP_PASSWORD:-"change-me"}
WP_SHOP_EMAIL=${WP_SHOP_EMAIL:-"myriam@example.com"}
BOOTSTRAP_VERSION="5"

log() {
  echo "[bootstrap] $1"
}

run_wp() {
  wp --path="${WP_PATH}" "$@"
}

wait_for_wordpress_files() {
  for _ in {1..60}; do
    if [[ -f "${WP_PATH}/wp-config.php" ]]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

wait_for_database() {
  for _ in {1..60}; do
    if run_wp db check >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  return 1
}

ensure_wordpress_installed() {
  if run_wp core is-installed >/dev/null 2>&1; then
    log "WordPress already installed"
    return
  fi

  log "Installing WordPress core"
  until run_wp core install \
    --url="${WP_URL}" \
    --title="${WP_TITLE}" \
    --admin_user="${WP_ADMIN_USER}" \
    --admin_password="${WP_ADMIN_PASSWORD}" \
    --admin_email="${WP_ADMIN_EMAIL}" \
    --skip-email >/dev/null 2>&1; do
    log "Waiting for database to accept WordPress install..."
    sleep 5
  done
}

install_or_activate() {
  local slug="$1"
  if run_wp plugin is-installed "${slug}" >/dev/null 2>&1; then
    run_wp plugin activate "${slug}" >/dev/null 2>&1 || true
  else
    run_wp plugin install "${slug}" --activate >/dev/null 2>&1 || true
  fi
}

ensure_user() {
  local username="$1"
  local email="$2"
  local role="$3"
  local password="$4"
  if run_wp user get "${username}" >/dev/null 2>&1; then
    run_wp user update "${username}" --role="${role}" --user_pass="${password}" >/dev/null 2>&1 || true
  else
    run_wp user create "${username}" "${email}" --role="${role}" --user_pass="${password}" >/dev/null 2>&1 || true
  fi
}

create_category() {
  local name="$1"
  local slug="$2"
  run_wp wc product_cat create --name="${name}" --slug="${slug}" --user="${WP_ADMIN_USER}" >/dev/null 2>&1 || true
}

ensure_fix_cors_plugin() {
  local plugin_path="${WP_PATH}/wp-content/plugins/fix-cors.php"
  if [[ ! -f "${plugin_path}" ]]; then
    cat > "${plugin_path}" <<'PHP'
<?php
/**
 * Plugin Name: Fix CORS and Asset Loading
 * Version: 1.0
 */
function add_cors_headers() {
    header('Access-Control-Allow-Origin: *');
}
add_action('send_headers', 'add_cors_headers');
PHP
  fi
  run_wp plugin activate fix-cors >/dev/null 2>&1 || true
}

tag_bootstrap_version() {
  if run_wp option get myngcraft_bootstrap_version >/dev/null 2>&1; then
    run_wp option update myngcraft_bootstrap_version "${BOOTSTRAP_VERSION}" --autoload=yes >/dev/null 2>&1 || true
  else
    run_wp option add myngcraft_bootstrap_version "${BOOTSTRAP_VERSION}" --autoload=yes >/dev/null 2>&1 || true
  fi
}

ensure_feminine_child_theme() {
  local theme_dir="${WP_PATH}/wp-content/themes/myngcraft-feminine"
  mkdir -p "${theme_dir}"

  cat > "${theme_dir}/style.css" <<'EOF'
/*
 Theme Name: MyngCraft Bloom
 Theme URI: https://example.com/myngcraft-bloom
 Description: Feminine Astra child theme tailored for handcrafted jewelry & decor boutiques.
 Author: MyngCraft
 Template: astra
 Version: 1.0.0
*/

:root {
  --bloom-blush: #ffeef2;
  --bloom-rose: #c75c7a;
  --bloom-berry: #963450;
  --bloom-sand: #fff8f5;
  --bloom-chocolate: #4a3b39;
}

body {
  font-family: 'Source Sans 3', 'Helvetica Neue', sans-serif;
  background: var(--bloom-sand);
  color: var(--bloom-chocolate);
  letter-spacing: 0.2px;
}

h1, h2, h3, h4, h5, h6,
.ast-single-post .entry-title,
.woocommerce ul.products li.product .woocommerce-loop-product__title {
  font-family: 'Playfair Display', 'Georgia', serif;
  color: var(--bloom-chocolate);
  letter-spacing: 0.5px;
}

.ast-primary-header-bar {
  background: #fff9fb;
  border-bottom: 1px solid #f4cbd4;
  box-shadow: 0 5px 25px rgba(199, 92, 122, 0.08);
}

.ast-site-identity .site-title a,
.ast-site-identity .site-description {
  text-transform: uppercase;
  letter-spacing: 3px;
  color: var(--bloom-rose);
}

a,
.woocommerce-tabs ul.tabs li.active a {
  color: var(--bloom-rose);
}

a:hover,
.ast-breadcrumb a:hover {
  color: var(--bloom-berry);
}

button,
.button,
.wp-block-button__link,
.woocommerce a.button,
.woocommerce button.button,
.woocommerce input.button {
  background: linear-gradient(135deg, var(--bloom-rose), var(--bloom-berry));
  border: none;
  border-radius: 999px;
  color: #fff;
  padding: 12px 28px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
}

.wp-block-button.is-style-outline .wp-block-button__link {
  border-color: var(--bloom-rose);
  color: var(--bloom-rose);
}

.woocommerce ul.products li.product,
.woocommerce div.product,
.ast-woocommerce-container {
  background: #fff;
  border-radius: 24px;
  border: 1px solid #ffe0e8;
  padding: 20px;
  box-shadow: 0 15px 40px rgba(231, 158, 181, 0.2);
}

.woocommerce ul.products li.product .price,
.woocommerce div.product p.price,
.woocommerce div.product span.price {
  color: var(--bloom-berry);
  font-weight: 600;
}

.site-footer,
.ast-footer-overlay {
  background: #2d1f23;
  color: #fce9ee;
}

.site-footer a {
  color: #f7c1d4;
}

.ast-header-account .ast-header-account-type-icon svg {
  stroke: var(--bloom-rose);
}

.woocommerce .quantity .qty {
  border-radius: 999px;
  border-color: #f4cbd4;
}

.ast-woo-product-category,
.ast-woo-shop-category {
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #c27a89;
}

.wp-block-cover .wp-block-cover__inner-container h1,
.wp-block-cover .wp-block-cover__inner-container p {
  text-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.myngcraft-order-status-card {
  background: #fff0f4;
  border-radius: 24px;
  padding: 32px;
  margin: 30px 0;
  border: 1px solid #f3b9c6;
  box-shadow: 0 15px 35px rgba(204, 110, 138, 0.2);
}

.myngcraft-order-status-card h3 {
  font-family: 'Playfair Display', serif;
  margin-bottom: 12px;
  color: var(--bloom-berry);
}

.myngcraft-order-status-card ul {
  padding-left: 18px;
  margin-bottom: 12px;
}

.myngcraft-order-status-card a {
  color: var(--bloom-rose);
  font-weight: 600;
}

@media (max-width: 768px) {
  .ast-primary-header-bar {
    border-bottom: none;
    box-shadow: none;
  }

  .woocommerce ul.products li.product,
  .woocommerce div.product {
    padding: 16px;
  }
}
EOF

  cat > "${theme_dir}/functions.php" <<'PHP'
<?php
add_action( 'wp_enqueue_scripts', function () {
    wp_enqueue_style( 'astra-parent-style', get_template_directory_uri() . '/style.css', [], wp_get_theme( 'astra' )->get( 'Version' ) );
    wp_enqueue_style(
        'myngcraft-feminine-fonts',
        'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Source+Sans+3:wght@300;400;500;600&display=swap',
        [],
        null
    );
    wp_enqueue_style( 'myngcraft-feminine-style', get_stylesheet_uri(), [ 'astra-parent-style', 'myngcraft-feminine-fonts' ], wp_get_theme()->get( 'Version' ) );
} );

add_filter( 'astra_theme_defaults', function ( $defaults ) {
    $defaults['site-content-layout'] = 'plain-container';
    $defaults['global-color-palette'] = [ '#c75c7a', '#963450', '#ffeef2', '#4a3b39', '#fff8f5', '#2d1f23' ];
    return $defaults;
} );

add_filter( 'astra_get_option_site_content_layout', function () {
    return 'plain-container';
} );

add_filter( 'astra_default_strings', function ( $strings ) {
    if ( isset( $strings['string-powered-by'] ) ) {
        $strings['string-powered-by'] = '';
    }
    if ( isset( $strings['string-copyright-text'] ) ) {
        $strings['string-copyright-text'] = '';
    }
    return $strings;
} );

add_filter( 'astra_footer_powered_by', '__return_empty_string' );
add_filter( 'astra_powered_by_text', '__return_empty_string' );

add_filter( 'astra_footer_copyright_content', function () {
    return sprintf( '▌Copyright © %s Myriam Craft Store | Powered by CodeNova', date_i18n( 'Y' ) );
} );

add_filter( 'astra_footer_copyright', function () {
    return sprintf( '▌Copyright © %s Myriam Craft Store | Powered by CodeNova', date_i18n( 'Y' ) );
} );

add_action( 'woocommerce_account_dashboard', function () {
    ?>
    <section class="myngcraft-order-status-card">
        <h3>Need an update?</h3>
        <p>See current orders, download receipts, and update addresses anytime.</p>
        <ul>
            <li><strong>Processing</strong> – we are crafting and quality checking.</li>
            <li><strong>Completed</strong> – your parcel is on the way with tracking.</li>
            <li><strong>On Hold</strong> – we just need a detail from you; check email.</li>
        </ul>
        <a href="/order-status">Check order status & tracking →</a>
    </section>
    <?php
} );
PHP

  run_wp theme list >/dev/null 2>&1 || true
  if run_wp theme is-installed myngcraft-feminine >/dev/null 2>&1; then
    run_wp theme activate myngcraft-feminine >/dev/null 2>&1 || true
  else
    run_wp theme activate astra >/dev/null 2>&1 || true
  fi
}

create_or_update_page() {
  local slug="$1"
  local title="$2"
  local content="$3"
  local page_id
  page_id=$(run_wp post list --post_type=page --name="$slug" --posts_per_page=1 --format=ids | head -n1 | tr -d '[:space:]')
  if [[ -z "$page_id" ]]; then
    page_id=$(run_wp post create --post_type=page --post_status=publish --post_name="$slug" --post_title="$title" --porcelain --post_content="$content" | tr -d '[:space:]')
  else
    run_wp post update "$page_id" --post_title="$title" --post_content="$content" >/dev/null 2>&1 || true
  fi
  echo "$page_id"
}

get_page_id_by_slug() {
  local slug="$1"
  run_wp post list --post_type=page --name="$slug" --posts_per_page=1 --format=ids | head -n1 | tr -d '[:space:]'
}

setup_primary_menu() {
  local php_code
  php_code=$(cat <<'PHP'
$menu_name = 'Primary Menu';
$menu = wp_get_nav_menu_object( $menu_name );
if ( $menu ) {
    wp_delete_nav_menu( $menu->term_id );
}
$menu_id = wp_create_nav_menu( $menu_name );
$targets = [
    [ 'slug' => 'home', 'title' => 'Home' ],
    [ 'slug' => 'shop', 'title' => 'Shop' ],
    [ 'slug' => 'my-account', 'title' => 'My Account' ],
    [ 'slug' => 'order-status', 'title' => 'Order Status' ],
    [ 'slug' => 'cart', 'title' => 'Cart' ],
    [ 'slug' => 'about', 'title' => 'Our Story' ],
    [ 'slug' => 'contact', 'title' => 'Visit & Contact' ],
];
foreach ( $targets as $target ) {
    $slug = $target['slug'];
    $title = $target['title'];
    $page_id = null;
    if ( 'shop' === $slug ) {
        $page_id = (int) get_option( 'woocommerce_shop_page_id' );
    } else {
        $page = get_page_by_path( $slug );
        if ( $page ) {
            $page_id = $page->ID;
        }
    }
    if ( $page_id ) {
        wp_update_nav_menu_item( $menu_id, 0, [
            'menu-item-title'     => $title,
            'menu-item-object'    => 'page',
            'menu-item-object-id' => $page_id,
            'menu-item-type'      => 'post_type',
            'menu-item-status'    => 'publish',
        ] );
    }
}
$locations = get_theme_mod( 'nav_menu_locations', [] );
$locations['primary'] = $menu_id;
set_theme_mod( 'nav_menu_locations', $locations );
PHP
)
  run_wp eval "$php_code" >/dev/null 2>&1 || true
}

design_crafts_pages() {
  run_wp option update blogdescription "Handcrafted Jewelry & Decor Boutique" >/dev/null 2>&1 || true

  local HOME_CONTENT ABOUT_CONTENT CONTACT_CONTENT ORDER_STATUS_CONTENT
  local HOME_PAGE_ID ABOUT_PAGE_ID CONTACT_PAGE_ID ORDER_STATUS_PAGE_ID

  HOME_CONTENT=$(cat <<'EOF'
<!-- wp:cover {"url":"https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80","dimRatio":30,"minHeight":540,"contentPosition":"center center","align":"full"} -->
<div class="wp-block-cover alignfull" style="min-height:540px"><span aria-hidden="true" class="wp-block-cover__background has-background-dim"></span><img class="wp-block-cover__image-background" alt="Blush jewelry styling" src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80" data-object-fit="cover"/><div class="wp-block-cover__inner-container"><!-- wp:heading {"textAlign":"center","level":1,"style":{"typography":{"fontSize":"66px","letterSpacing":"1.5px"}},"textColor":"white"} -->
<h1 class="has-text-align-center has-white-color has-text-color" style="font-size:66px;letter-spacing:1.5px">Bloom Atelier</h1>
<!-- /wp:heading -->

<!-- wp:paragraph {"align":"center","style":{"typography":{"fontSize":"20px","letterSpacing":"2px"}},"textColor":"white"} -->
<p class="has-text-align-center has-white-color has-text-color" style="font-size:20px;letter-spacing:2px">Romantic jewelry, delicate textiles, and feminine decor woven for modern muses.</p>
<!-- /wp:paragraph -->

<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons"><!-- wp:button {"style":{"border":{"radius":"999px"},"spacing":{"padding":{"left":"30px","right":"30px","top":"14px","bottom":"14px"}}},"backgroundColor":"vivid-red","textColor":"white"} -->
<div class="wp-block-button"><a class="wp-block-button__link has-white-color has-vivid-red-background-color has-text-color has-background" href="/shop" style="border-radius:999px;padding-top:14px;padding-right:30px;padding-bottom:14px;padding-left:30px">Shop New Arrivals</a></div>
<!-- /wp:button -->

<!-- wp:button {"className":"is-style-outline","style":{"border":{"radius":"999px"},"spacing":{"padding":{"left":"30px","right":"30px","top":"14px","bottom":"14px"}}},"textColor":"white"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link has-white-color has-text-color" href="#story" style="border-radius:999px;padding-top:14px;padding-right:30px;padding-bottom:14px;padding-left:30px">Our Story</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons --></div></div>
<!-- /wp:cover -->

<!-- wp:heading {"textAlign":"center","style":{"typography":{"fontSize":"34px"},"color":{"text":"#963450"}},"fontFamily":"playfair-display"} -->
<h2 class="has-text-align-center has-playfair-display-font-family" style="font-size:34px;color:#963450">Pieces that glow with softness</h2>
<!-- /wp:heading -->

<!-- wp:columns {"align":"wide"} -->
<div class="wp-block-columns alignwide"><!-- wp:column -->
<div class="wp-block-column"><!-- wp:image -->
<figure class="wp-block-image"><img src="https://images.unsplash.com/photo-1441981974669-8f9bc0978b97?auto=format&fit=crop&w=900&q=80" alt="Rose gold jewelry"/></figure>
<!-- /wp:image -->

<!-- wp:heading {"level":3} -->
<h3>Rosy Jewels</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Shimmering earrings, layered chains, and talismans kissed with blush gemstones.</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column"><!-- wp:image -->
<figure class="wp-block-image"><img src="https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80" alt="Soft textiles"/></figure>
<!-- /wp:image -->

<!-- wp:heading {"level":3} -->
<h3>Soft Textiles</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Hand-loomed throws, embroidered pillows, and silk accessories for dreamy spaces.</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column"><!-- wp:image -->
<figure class="wp-block-image"><img src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80" alt="Decor"/></figure>
<!-- /wp:image -->

<!-- wp:heading {"level":3} -->
<h3>Artful Decor</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Poetic ceramics, botanical prints, and candlelit moments styled with intention.</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column --></div>
<!-- /wp:columns -->

<!-- wp:group {"align":"full","style":{"spacing":{"padding":{"top":"70px","bottom":"70px","left":"20px","right":"20px"}}},"backgroundColor":"pale-pink"} -->
<div class="wp-block-group alignfull has-pale-pink-background-color has-background" id="story" style="padding-top:70px;padding-right:20px;padding-bottom:70px;padding-left:20px"><!-- wp:heading {"textAlign":"center"} -->
<h2 class="has-text-align-center">Crafted for modern romantics</h2>
<!-- /wp:heading -->

<!-- wp:paragraph {"align":"center"} -->
<p class="has-text-align-center">Every piece is handmade in small batches, honoring botanicals, heritage motifs, and the softness of everyday rituals.</p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->
EOF
)
  ABOUT_CONTENT=$(cat <<'EOF'
<!-- wp:heading -->
<h2>A love letter to artistry</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Bloom Atelier began as a circle of women metalsmiths, ceramicists, and textile artists who dreamed of a softer, slower way to adorn life's milestones. We sculpt with recycled metals, paint with botanical dyes, and weave with organic fibers that tell stories of place and heart.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Our pieces are created in tiny batches to preserve detail—engraved lockets, macramé wall blooms, and tableware that turns gatherings into rituals. Every purchase supports the artisans behind the work and funds apprenticeships for emerging makers.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>We invite you to sip rose tea at our studio, try on heirloom-worthy jewels, and co-design bespoke gifts that celebrate femininity in all its forms.</p>
<!-- /wp:paragraph -->
EOF
)
  CONTACT_CONTENT=$(cat <<'EOF'
<!-- wp:heading -->
<h2>Visit the Bloom Studio</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><strong>Bloom Atelier</strong><br>428 Artisan Lane<br>Brooklyn, NY 11205</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>Hours</strong><br>Tuesday – Friday: 11a – 6p<br>Saturday: 10a – 4p</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>Email</strong>: hello@myriamcraft.com<br><strong>Phone</strong>: (718) 555-0198<br><strong>Instagram</strong>: @bloomatelier</p>
<!-- /wp:paragraph -->

<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button {"style":{"border":{"radius":"999px"}}} -->
<div class="wp-block-button"><a class="wp-block-button__link" href="mailto:hello@myriamcraft.com" style="border-radius:999px">Plan a Styling Appointment</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->
EOF
)

  ORDER_STATUS_CONTENT=$(cat <<'EOF'
<!-- wp:heading -->
<h2>Order Status &amp; Tracking</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Track where your handcrafted pieces are in our studio process. Enter your order number and email to see the latest updates.</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[woocommerce_order_tracking]
<!-- /wp:shortcode -->

<!-- wp:columns -->
<div class="wp-block-columns"><!-- wp:column -->
<div class="wp-block-column"><!-- wp:heading {"level":4} -->
<h4>Status Guide</h4>
<!-- /wp:heading -->

<!-- wp:list -->
<ul><li><strong>Processing</strong> – your order is being handcrafted and quality checked.</li><li><strong>Awaiting Pickup</strong> – we are packaging with our signature wrap.</li><li><strong>Completed</strong> – on its way to you; tracking sent via email.</li></ul>
<!-- /wp:list --></div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column"><!-- wp:heading {"level":4} -->
<h4>Need a change?</h4>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Email <a href="mailto:hello@myriamcraft.com">hello@myriamcraft.com</a> within 24 hours for engraving edits, address updates, or rush requests.</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column --></div>
<!-- /wp:columns -->
EOF
)

  HOME_PAGE_ID=$(create_or_update_page "home" "Handcrafted Elegance" "$HOME_CONTENT")
  ABOUT_PAGE_ID=$(create_or_update_page "about" "About Our Collective" "$ABOUT_CONTENT")
  CONTACT_PAGE_ID=$(create_or_update_page "contact" "Visit & Contact" "$CONTACT_CONTENT")
  ORDER_STATUS_PAGE_ID=$(create_or_update_page "order-status" "Order Status & Tracking" "$ORDER_STATUS_CONTENT")

  if [[ -n "$HOME_PAGE_ID" ]]; then
    run_wp option update show_on_front page >/dev/null 2>&1 || true
    run_wp option update page_on_front "$HOME_PAGE_ID" >/dev/null 2>&1 || true
  fi
  setup_primary_menu
}

log "Waiting for WordPress files"
if ! wait_for_wordpress_files; then
  log "Timed out waiting for wp-config.php"
  exit 1
fi

log "Waiting for database connectivity"
if ! wait_for_database; then
  log "Timed out waiting for database"
  exit 1
fi

if run_wp core is-installed >/dev/null 2>&1; then
  current_version=$(run_wp option get myngcraft_bootstrap_version 2>/dev/null || echo "")
  if [[ "${current_version}" == "${BOOTSTRAP_VERSION}" ]]; then
    log "Bootstrap already applied (version ${BOOTSTRAP_VERSION})"
    exit 0
  fi
fi

ensure_wordpress_installed

log "Installing and activating required plugins"
install_or_activate woocommerce
install_or_activate wordpress-seo
install_or_activate wordfence
if run_wp plugin install wp-rocket --activate >/dev/null 2>&1; then
  log "Installed WP Rocket"
else
  log "WP Rocket unavailable; activating wp-super-cache"
  install_or_activate wp-super-cache
fi

log "Ensuring Astra theme is active"
if run_wp theme is-installed astra >/dev/null 2>&1; then
  run_wp theme activate astra >/dev/null 2>&1 || true
else
  run_wp theme install astra --activate >/dev/null 2>&1 || true
fi

log "Applying feminine Astra child theme"
ensure_feminine_child_theme

log "Ensuring admin and shop users exist"
ensure_user "${WP_ADMIN_USER}" "${WP_ADMIN_EMAIL}" administrator "${WP_ADMIN_PASSWORD}"
ensure_user "${WP_SHOP_USER}" "${WP_SHOP_EMAIL}" shop_manager "${WP_SHOP_PASSWORD}"

log "Configuring permalinks"
run_wp rewrite structure '/%postname%/' --hard >/dev/null 2>&1 || true
run_wp rewrite flush --hard >/dev/null 2>&1 || true

log "Configuring WooCommerce defaults"
run_wp wc tool run install_pages --user="${WP_ADMIN_USER}" >/dev/null 2>&1 || true
if ! run_wp option get woocommerce_db_version >/dev/null 2>&1; then
  run_wp eval $'if (class_exists("\\WC_Install")) { \\WC_Install::install(); }' >/dev/null 2>&1 || true
fi
run_wp option update woocommerce_currency "USD" >/dev/null 2>&1 || true
run_wp option update woocommerce_enable_guest_checkout "no" >/dev/null 2>&1 || true
run_wp option update woocommerce_enable_checkout_registration "yes" >/dev/null 2>&1 || true
run_wp option update woocommerce_enable_myaccount_registration "yes" >/dev/null 2>&1 || true
run_wp option update woocommerce_registration_generate_password "no" >/dev/null 2>&1 || true
run_wp option update woocommerce_enable_signup_and_login_from_checkout "yes" >/dev/null 2>&1 || true
run_wp option update woocommerce_allow_tracking "no" >/dev/null 2>&1 || true
run_wp option update woocommerce_cart_redirect_after_add "no" >/dev/null 2>&1 || true

log "Creating product categories"
create_category "Jewelry" "jewelry"
create_category "Decorations" "decorations"
create_category "Textiles" "textiles"
create_category "Pottery" "pottery"
create_category "Accessories" "accessories"

log "Adding fix-cors helper plugin"
ensure_fix_cors_plugin

log "Designing Astra storefront for crafts & jewelry"
design_crafts_pages

MY_ACCOUNT_PAGE_ID=$(get_page_id_by_slug "my-account")
CART_PAGE_ID=$(get_page_id_by_slug "cart")
CHECKOUT_PAGE_ID=$(get_page_id_by_slug "checkout")
SHOP_PAGE_ID=$(get_page_id_by_slug "shop")
if [[ -n "$MY_ACCOUNT_PAGE_ID" ]]; then
  run_wp option update woocommerce_myaccount_page_id "$MY_ACCOUNT_PAGE_ID" >/dev/null 2>&1 || true
fi
if [[ -n "$CART_PAGE_ID" ]]; then
  run_wp option update woocommerce_cart_page_id "$CART_PAGE_ID" >/dev/null 2>&1 || true
fi
if [[ -n "$CHECKOUT_PAGE_ID" ]]; then
  run_wp option update woocommerce_checkout_page_id "$CHECKOUT_PAGE_ID" >/dev/null 2>&1 || true
fi
if [[ -n "$SHOP_PAGE_ID" ]]; then
  run_wp option update woocommerce_shop_page_id "$SHOP_PAGE_ID" >/dev/null 2>&1 || true
fi

tag_bootstrap_version
log "Bootstrap completed"
