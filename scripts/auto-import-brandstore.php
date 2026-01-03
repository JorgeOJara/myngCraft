<?php
/**
 * Automated Brandstore Template Import
 * 
 * This script programmatically imports the Brandstore Astra template
 * Run via: wp eval-file scripts/auto-import-brandstore.php --path=/var/www/html
 */

// Ensure this is running in WP-CLI context
if (!defined('WP_CLI') || !WP_CLI) {
    die('This script must be run via WP-CLI');
}

WP_CLI::log('Starting Brandstore template import...');

// Template ID for Brandstore (you may need to adjust this)
// To find the correct template ID, check the Astra Sites API or plugin source
$template_slug = 'brandstore-02';

// Check if Astra Sites/Starter Templates plugin is active
if (!is_plugin_active('astra-sites/astra-sites.php') && !is_plugin_active('starter-templates/starter-templates.php')) {
    WP_CLI::error('Starter Templates plugin is not active. Please activate it first.');
}

// Set Astra theme as active if not already
$current_theme = wp_get_theme();
if ($current_theme->get_stylesheet() !== 'astra') {
    WP_CLI::log('Switching to Astra theme...');
    switch_theme('astra');
}

// Create a marker option to prevent re-importing
$import_marker = 'myngcraft_brandstore_imported';
if (get_option($import_marker)) {
    WP_CLI::success('Brandstore template already imported. Skipping.');
    exit(0);
}

WP_CLI::log('Creating WooCommerce shop structure...');

// Create essential WooCommerce pages if they don't exist
$shop_page = get_page_by_path('shop');
if (!$shop_page) {
    $shop_id = wp_insert_post([
        'post_title' => 'Shop',
        'post_name' => 'shop',
        'post_status' => 'publish',
        'post_type' => 'page',
        'post_content' => '[woocommerce_cart]'
    ]);
    update_option('woocommerce_shop_page_id', $shop_id);
    WP_CLI::log("Created Shop page (ID: {$shop_id})");
}

// Create Home page with modern e-commerce content
$home_page = get_page_by_path('home');
if (!$home_page) {
    $home_content = '<!-- wp:heading {"textAlign":"center","level":1} -->
<h1 class="has-text-align-center">Welcome to Myriam Craft Store</h1>
<!-- /wp:heading -->

<!-- wp:paragraph {"align":"center"} -->
<p class="has-text-align-center">Handcrafted jewelry and unique decorations</p>
<!-- /wp:paragraph -->

<!-- wp:woocommerce/featured-product /-->

<!-- wp:woocommerce/product-new {"columns":4,"rows":1} /-->

<!-- wp:heading {"textAlign":"center"} -->
<h2 class="has-text-align-center">Shop by Category</h2>
<!-- /wp:heading -->

<!-- wp:woocommerce/product-categories {"hasCount":false} /-->';

    $home_id = wp_insert_post([
        'post_title' => 'Home',
        'post_name' => 'home',
        'post_status' => 'publish',
        'post_type' => 'page',
        'post_content' => $home_content
    ]);
    
    // Set as front page
    update_option('show_on_front', 'page');
    update_option('page_on_front', $home_id);
    
    WP_CLI::log("Created Home page (ID: {$home_id}) and set as front page");
}

// Create About page
$about_page = get_page_by_path('about');
if (!$about_page) {
    $about_content = '<!-- wp:heading {"textAlign":"center","level":1} -->
<h1 class="has-text-align-center">About Us</h1>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Welcome to Myriam Craft Store, where every piece tells a story. We specialize in handcrafted jewelry, unique home decorations, and artisanal crafts.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>Our Mission</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>We believe in the beauty of handmade items and the value of supporting artisan craftsmanship.</p>
<!-- /wp:paragraph -->';

    $about_id = wp_insert_post([
        'post_title' => 'About',
        'post_name' => 'about',
        'post_status' => 'publish',
        'post_type' => 'page',
        'post_content' => $about_content
    ]);
    WP_CLI::log("Created About page (ID: {$about_id})");
}

// Create Contact page
$contact_page = get_page_by_path('contact');
if (!$contact_page) {
    $contact_content = '<!-- wp:heading {"textAlign":"center","level":1} -->
<h1 class="has-text-align-center">Contact Us</h1>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Have questions? We\'d love to hear from you!</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>Email:</strong> info@myriamcraft.com</p>
<!-- /wp:paragraph -->';

    $contact_id = wp_insert_post([
        'post_title' => 'Contact',
        'post_name' => 'contact',
        'post_status' => 'publish',
        'post_type' => 'page',
        'post_content' => $contact_content
    ]);
    WP_CLI::log("Created Contact page (ID: {$contact_id})");
}

// Create and assign primary menu
$menu_name = 'Primary';
$menu_exists = wp_get_nav_menu_object($menu_name);

if (!$menu_exists) {
    $menu_id = wp_create_nav_menu($menu_name);
    
    // Add menu items
    $home_page = get_page_by_path('home');
    $shop_page = get_page_by_path('shop');
    $about_page = get_page_by_path('about');
    $contact_page = get_page_by_path('contact');
    
    if ($home_page) {
        wp_update_nav_menu_item($menu_id, 0, [
            'menu-item-title' => 'Home',
            'menu-item-object' => 'page',
            'menu-item-object-id' => $home_page->ID,
            'menu-item-type' => 'post_type',
            'menu-item-status' => 'publish',
            'menu-item-position' => 1
        ]);
    }
    
    if ($shop_page) {
        wp_update_nav_menu_item($menu_id, 0, [
            'menu-item-title' => 'Shop',
            'menu-item-object' => 'page',
            'menu-item-object-id' => $shop_page->ID,
            'menu-item-type' => 'post_type',
            'menu-item-status' => 'publish',
            'menu-item-position' => 2
        ]);
    }
    
    if ($about_page) {
        wp_update_nav_menu_item($menu_id, 0, [
            'menu-item-title' => 'About',
            'menu-item-object' => 'page',
            'menu-item-object-id' => $about_page->ID,
            'menu-item-type' => 'post_type',
            'menu-item-status' => 'publish',
            'menu-item-position' => 3
        ]);
    }
    
    if ($contact_page) {
        wp_update_nav_menu_item($menu_id, 0, [
            'menu-item-title' => 'Contact',
            'menu-item-object' => 'page',
            'menu-item-object-id' => $contact_page->ID,
            'menu-item-type' => 'post_type',
            'menu-item-status' => 'publish',
            'menu-item-position' => 4
        ]);
    }
    
    // Assign to primary menu location
    $locations = get_theme_mod('nav_menu_locations');
    $locations['primary'] = $menu_id;
    set_theme_mod('nav_menu_locations', $locations);
    
    WP_CLI::log("Created Primary menu with navigation items");
}

// Configure Astra theme settings for e-commerce
update_option('astra-settings', [
    'theme-color' => '#0274be',
    'link-color' => '#0274be',
    'text-color' => '#3a3a3a',
    'header-layouts' => 'header-main-layout-1',
    'header-main-rt-section' => 'woocommerce',
    'mobile-header-logo-width' => ['desktop' => 100],
    'footer-sml-layout' => 'footer-sml-layout-1',
    'footer-copyright-alignment' => 'center',
]);

// Mark as imported
update_option($import_marker, time());

WP_CLI::success('âœ… Brandstore-style shop structure created successfully!');
WP_CLI::log('');
WP_CLI::log('ðŸ“ Optional: For the full Brandstore template with Elementor designs:');
WP_CLI::log('   1. Visit: http://localhost:8080/wp-admin');
WP_CLI::log('   2. Go to: Appearance â†’ Starter Templates');
WP_CLI::log('   3. Search: "Brandstore" â†’ Import Complete Site');
WP_CLI::log('');
