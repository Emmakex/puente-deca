<?php
/**
 * Plugin Name: Puente DeCA for WooCommerce
 * Plugin URI: https://github.com/Emmakex/puente-deca
 * Description: Connects WooCommerce orders to Puente DeCA while keeping transport-compliance rules in the bridge.
 * Version: 0.1.0
 * Author: Kairoseth Extensions
 * Text Domain: puente-deca-woocommerce
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * WC requires at least: 8.2
 * License: GPL-2.0-or-later
 */

defined( 'ABSPATH' ) || exit;

define( 'PDECA_WOO_VERSION', '0.1.0' );
define( 'PDECA_WOO_FILE', __FILE__ );
define( 'PDECA_WOO_PATH', plugin_dir_path( __FILE__ ) );

add_action(
    'before_woocommerce_init',
    static function () {
        if ( class_exists( '\\Automattic\\WooCommerce\\Utilities\\FeaturesUtil' ) ) {
            \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
        }
    }
);

add_action(
    'plugins_loaded',
    static function () {
        load_plugin_textdomain( 'puente-deca-woocommerce', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );

        if ( ! class_exists( 'WooCommerce' ) ) {
            add_action(
                'admin_notices',
                static function () {
                    if ( current_user_can( 'activate_plugins' ) ) {
                        echo '<div class="notice notice-error"><p>' . esc_html__( 'Puente DeCA for WooCommerce requires WooCommerce to be active.', 'puente-deca-woocommerce' ) . '</p></div>';
                    }
                }
            );
            return;
        }

        require_once PDECA_WOO_PATH . 'includes/class-pdeca-woo-secret-store.php';
        require_once PDECA_WOO_PATH . 'includes/class-pdeca-woo-settings.php';
        require_once PDECA_WOO_PATH . 'includes/class-pdeca-woo-client.php';
        require_once PDECA_WOO_PATH . 'includes/class-pdeca-woo-order-payload.php';
        require_once PDECA_WOO_PATH . 'includes/class-pdeca-woo-connector.php';

        PDECA_Woo_Connector::instance()->boot();
    },
    20
);

register_deactivation_hook(
    __FILE__,
    static function () {
        if ( function_exists( 'as_unschedule_all_actions' ) ) {
            as_unschedule_all_actions( 'pdeca_woo_process_order', array(), 'puente-deca' );
        }
        wp_clear_scheduled_hook( 'pdeca_woo_process_order' );
    }
);
