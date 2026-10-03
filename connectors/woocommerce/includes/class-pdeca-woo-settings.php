<?php

defined( 'ABSPATH' ) || exit;

final class PDECA_Woo_Settings {
    const OPTION = 'pdeca_woo_settings';

    public static function get() {
        $defaults = array(
            'endpoint'                      => '',
            'shipper_name'                  => '',
            'shipper_tax_id'                => '',
            'shipper_address'               => '',
            'origin'                        => '',
            'carrier_name'                  => '',
            'carrier_tax_id'                => '',
            'carrier_name_meta_key'         => '_pdeca_carrier_name',
            'carrier_tax_id_meta_key'       => '_pdeca_carrier_tax_id',
            'transport_date_meta_key'       => '_pdeca_transport_date',
            'tractor_registration_meta_key' => '_pdeca_tractor_registration',
            'trailer_registration_meta_key' => '_pdeca_trailer_registration',
            'special_authorization_meta_key'=> '_pdeca_special_traffic_authorization',
            'weight_meta_key'               => '_pdeca_weight_kg',
            'auto_statuses'                 => array(),
            'request_timeout'               => 15,
        );

        $settings = get_option( self::OPTION, array() );
        return wp_parse_args( is_array( $settings ) ? $settings : array(), $defaults );
    }

    public static function register() {
        add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
        add_action( 'admin_post_pdeca_woo_save_settings', array( __CLASS__, 'save' ) );
    }

    public static function menu() {
        add_submenu_page(
            'woocommerce',
            __( 'Puente DeCA', 'puente-deca-woocommerce' ),
            __( 'Puente DeCA', 'puente-deca-woocommerce' ),
            'manage_woocommerce',
            'puente-deca',
            array( __CLASS__, 'render' )
        );
    }

    private static function post_text( $key ) {
        return isset( $_POST[ $key ] ) ? sanitize_text_field( wp_unslash( $_POST[ $key ] ) ) : '';
    }

    private static function post_key( $key ) {
        return isset( $_POST[ $key ] ) ? trim( sanitize_text_field( wp_unslash( $_POST[ $key ] ) ) ) : '';
    }

    public static function save() {
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( esc_html__( 'You are not allowed to change these settings.', 'puente-deca-woocommerce' ) );
        }
        check_admin_referer( 'pdeca_woo_save_settings' );

        $endpoint = isset( $_POST['endpoint'] ) ? esc_url_raw( wp_unslash( $_POST['endpoint'] ) ) : '';
        $parts    = $endpoint ? wp_parse_url( $endpoint ) : array();
        if ( $endpoint && ( empty( $parts['scheme'] ) || 'https' !== strtolower( $parts['scheme'] ) ) ) {
            add_settings_error( 'pdeca_woo', 'endpoint', __( 'The Puente DeCA URL must use HTTPS.', 'puente-deca-woocommerce' ), 'error' );
            set_transient( 'settings_errors', get_settings_errors(), 30 );
            wp_safe_redirect( admin_url( 'admin.php?page=puente-deca' ) );
            exit;
        }

        $statuses = isset( $_POST['auto_statuses'] ) ? array_map( 'sanitize_key', (array) wp_unslash( $_POST['auto_statuses'] ) ) : array();
        $statuses = array_values( array_intersect( $statuses, array_keys( wc_get_order_statuses() ) ) );
        $statuses = array_map( static function ( $status ) { return preg_replace( '/^wc-/', '', $status ); }, $statuses );
        $timeout  = isset( $_POST['request_timeout'] ) ? absint( $_POST['request_timeout'] ) : 15;
        $timeout  = max( 5, min( 30, $timeout ) );

        update_option(
            self::OPTION,
            array(
                'endpoint'                      => untrailingslashit( $endpoint ),
                'shipper_name'                  => self::post_text( 'shipper_name' ),
                'shipper_tax_id'                => strtoupper( self::post_text( 'shipper_tax_id' ) ),
                'shipper_address'               => self::post_text( 'shipper_address' ),
                'origin'                        => self::post_text( 'origin' ),
                'carrier_name'                  => self::post_text( 'carrier_name' ),
                'carrier_tax_id'                => strtoupper( self::post_text( 'carrier_tax_id' ) ),
                'carrier_name_meta_key'         => self::post_key( 'carrier_name_meta_key' ),
                'carrier_tax_id_meta_key'       => self::post_key( 'carrier_tax_id_meta_key' ),
                'transport_date_meta_key'       => self::post_key( 'transport_date_meta_key' ),
                'tractor_registration_meta_key' => self::post_key( 'tractor_registration_meta_key' ),
                'trailer_registration_meta_key' => self::post_key( 'trailer_registration_meta_key' ),
                'special_authorization_meta_key'=> self::post_key( 'special_authorization_meta_key' ),
                'weight_meta_key'               => self::post_key( 'weight_meta_key' ),
                'auto_statuses'                 => $statuses,
                'request_timeout'               => $timeout,
            ),
            false
        );

        if ( isset( $_POST['api_key'] ) && '' !== trim( (string) wp_unslash( $_POST['api_key'] ) ) ) {
            if ( ! PDECA_Woo_Secret_Store::save( wp_unslash( $_POST['api_key'] ) ) ) {
                add_settings_error( 'pdeca_woo', 'api_key', __( 'The API key could not be encrypted on this server.', 'puente-deca-woocommerce' ), 'error' );
            }
        }

        if ( ! empty( $_POST['clear_api_key'] ) ) {
            PDECA_Woo_Secret_Store::save( '' );
        }

        add_settings_error( 'pdeca_woo', 'saved', __( 'Puente DeCA settings saved.', 'puente-deca-woocommerce' ), 'updated' );
        set_transient( 'settings_errors', get_settings_errors(), 30 );
        wp_safe_redirect( admin_url( 'admin.php?page=puente-deca' ) );
        exit;
    }

    public static function render() {
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            return;
        }

        $settings = self::get();
        $statuses = wc_get_order_statuses();
        settings_errors( 'pdeca_woo' );
        ?>
        <div class="wrap">
            <h1><?php esc_html_e( 'Puente DeCA', 'puente-deca-woocommerce' ); ?></h1>
            <p><?php esc_html_e( 'WooCommerce sends transport data to Puente DeCA. The plugin does not reproduce compliance rules inside WordPress.', 'puente-deca-woocommerce' ); ?></p>
            <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
                <input type="hidden" name="action" value="pdeca_woo_save_settings">
                <?php wp_nonce_field( 'pdeca_woo_save_settings' ); ?>
                <table class="form-table" role="presentation">
                    <tr><th><label for="pdeca-endpoint"><?php esc_html_e( 'Puente URL', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-endpoint" name="endpoint" type="url" required value="<?php echo esc_attr( $settings['endpoint'] ); ?>" placeholder="https://deca.example.com"></td></tr>
                    <tr><th><label for="pdeca-api-key"><?php esc_html_e( 'API key', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-api-key" name="api_key" type="password" autocomplete="new-password" value="" placeholder="<?php echo esc_attr( PDECA_Woo_Secret_Store::get() ? __( 'Stored securely — leave blank to keep it', 'puente-deca-woocommerce' ) : __( 'Not configured', 'puente-deca-woocommerce' ) ); ?>"><br><label><input type="checkbox" name="clear_api_key" value="1"> <?php esc_html_e( 'Remove stored API key', 'puente-deca-woocommerce' ); ?></label></td></tr>
                    <tr><th><label for="pdeca-shipper-name"><?php esc_html_e( 'Contractual shipper name', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-shipper-name" name="shipper_name" type="text" value="<?php echo esc_attr( $settings['shipper_name'] ); ?>"></td></tr>
                    <tr><th><label for="pdeca-shipper-tax"><?php esc_html_e( 'Contractual shipper tax ID', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-shipper-tax" name="shipper_tax_id" type="text" value="<?php echo esc_attr( $settings['shipper_tax_id'] ); ?>"></td></tr>
                    <tr><th><label for="pdeca-shipper-address"><?php esc_html_e( 'Contractual shipper address', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-shipper-address" name="shipper_address" type="text" value="<?php echo esc_attr( $settings['shipper_address'] ); ?>"></td></tr>
                    <tr><th><label for="pdeca-origin"><?php esc_html_e( 'Default loading origin', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-origin" name="origin" type="text" value="<?php echo esc_attr( $settings['origin'] ); ?>"></td></tr>
                    <tr><th><label for="pdeca-carrier-name"><?php esc_html_e( 'Default carrier name', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-carrier-name" name="carrier_name" type="text" value="<?php echo esc_attr( $settings['carrier_name'] ); ?>"></td></tr>
                    <tr><th><label for="pdeca-carrier-tax"><?php esc_html_e( 'Default carrier tax ID', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-carrier-tax" name="carrier_tax_id" type="text" value="<?php echo esc_attr( $settings['carrier_tax_id'] ); ?>"></td></tr>
                    <?php
                    $meta_fields = array(
                        'carrier_name_meta_key'         => __( 'Carrier name order meta', 'puente-deca-woocommerce' ),
                        'carrier_tax_id_meta_key'       => __( 'Carrier tax ID order meta', 'puente-deca-woocommerce' ),
                        'transport_date_meta_key'       => __( 'Transport date order meta', 'puente-deca-woocommerce' ),
                        'tractor_registration_meta_key' => __( 'Tractor registration order meta', 'puente-deca-woocommerce' ),
                        'trailer_registration_meta_key' => __( 'Trailer registration order meta', 'puente-deca-woocommerce' ),
                        'special_authorization_meta_key'=> __( 'Special authorization order meta', 'puente-deca-woocommerce' ),
                        'weight_meta_key'               => __( 'Shipment weight (kg) order meta', 'puente-deca-woocommerce' ),
                    );
                    foreach ( $meta_fields as $key => $label ) :
                        ?>
                        <tr><th><label for="pdeca-<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $label ); ?></label></th><td><input class="regular-text" id="pdeca-<?php echo esc_attr( $key ); ?>" name="<?php echo esc_attr( $key ); ?>" type="text" value="<?php echo esc_attr( $settings[ $key ] ); ?>"></td></tr>
                    <?php endforeach; ?>
                    <tr><th><?php esc_html_e( 'Automatic statuses', 'puente-deca-woocommerce' ); ?></th><td><?php foreach ( $statuses as $key => $label ) : $slug = preg_replace( '/^wc-/', '', $key ); ?><label style="display:block"><input type="checkbox" name="auto_statuses[]" value="<?php echo esc_attr( $key ); ?>" <?php checked( in_array( $slug, $settings['auto_statuses'], true ) ); ?>> <?php echo esc_html( $label ); ?></label><?php endforeach; ?><p class="description"><?php esc_html_e( 'Leave all unchecked for manual-only mode. Automatic processing still fails closed when required transport data is missing.', 'puente-deca-woocommerce' ); ?></p></td></tr>
                    <tr><th><label for="pdeca-timeout"><?php esc_html_e( 'HTTP timeout (seconds)', 'puente-deca-woocommerce' ); ?></label></th><td><input id="pdeca-timeout" name="request_timeout" type="number" min="5" max="30" value="<?php echo esc_attr( $settings['request_timeout'] ); ?>"></td></tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }
}
