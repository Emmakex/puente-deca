<?php

defined( 'ABSPATH' ) || exit;

final class PDECA_Woo_Settings {
    const OPTION = 'pdeca_woo_settings';

    public static function get() {
        $defaults = array(
            'endpoint'                      => 'https://kairoseth.com/api/deca',
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
        add_action( 'admin_post_pdeca_woo_test_connection', array( __CLASS__, 'test_connection' ) );
    }

    public static function menu() {
        add_submenu_page(
            'woocommerce',
            __( 'DeCA Transporte', 'puente-deca-woocommerce' ),
            __( 'DeCA Transporte', 'puente-deca-woocommerce' ),
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

    private static function missing_basic_configuration( $settings ) {
        $missing = array();
        $required = array(
            'endpoint'        => __( 'endpoint DeCA Transporte', 'puente-deca-woocommerce' ),
            'shipper_name'    => __( 'nombre legal del cargador', 'puente-deca-woocommerce' ),
            'shipper_tax_id'  => __( 'NIF/CIF del cargador', 'puente-deca-woocommerce' ),
            'shipper_address' => __( 'dirección del cargador', 'puente-deca-woocommerce' ),
            'origin'          => __( 'origen de carga', 'puente-deca-woocommerce' ),
        );

        foreach ( $required as $key => $label ) {
            if ( '' === trim( (string) $settings[ $key ] ) ) {
                $missing[] = $label;
            }
        }

        if ( ! PDECA_Woo_Secret_Store::get() ) {
            $missing[] = __( 'clave API de Cargo Connect', 'puente-deca-woocommerce' );
        }

        return $missing;
    }

    public static function test_connection() {
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( esc_html__( 'No tienes permisos para probar esta conexión.', 'puente-deca-woocommerce' ) );
        }
        check_admin_referer( 'pdeca_woo_test_connection' );

        $client = new PDECA_Woo_Client( self::get() );
        $result = $client->test_connection();

        if ( is_wp_error( $result ) ) {
            add_settings_error(
                'pdeca_woo',
                'connection_test',
                sprintf(
                    /* translators: %s is a sanitized API error message. */
                    __( 'No se pudo conectar con DeCA Transporte: %s', 'puente-deca-woocommerce' ),
                    $result->get_error_message()
                ),
                'error'
            );
        } else {
            add_settings_error(
                'pdeca_woo',
                'connection_test',
                __( 'La conexión con DeCA Transporte funciona correctamente.', 'puente-deca-woocommerce' ),
                'updated'
            );
        }

        set_transient( 'settings_errors', get_settings_errors(), 30 );
        wp_safe_redirect( admin_url( 'admin.php?page=puente-deca' ) );
        exit;
    }

    public static function save() {
        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( esc_html__( 'No tienes permisos para cambiar esta configuración.', 'puente-deca-woocommerce' ) );
        }
        check_admin_referer( 'pdeca_woo_save_settings' );

        $endpoint = isset( $_POST['endpoint'] ) ? esc_url_raw( wp_unslash( $_POST['endpoint'] ) ) : '';
        $parts    = $endpoint ? wp_parse_url( $endpoint ) : array();
        if ( $endpoint && ( empty( $parts['scheme'] ) || 'https' !== strtolower( $parts['scheme'] ) ) ) {
            add_settings_error( 'pdeca_woo', 'endpoint', __( 'La URL de DeCA Transporte debe usar HTTPS.', 'puente-deca-woocommerce' ), 'error' );
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
                add_settings_error( 'pdeca_woo', 'api_key', __( 'La clave API no pudo cifrarse en este servidor.', 'puente-deca-woocommerce' ), 'error' );
            }
        }

        if ( ! empty( $_POST['clear_api_key'] ) ) {
            PDECA_Woo_Secret_Store::save( '' );
        }

        add_settings_error( 'pdeca_woo', 'saved', __( 'Configuración de DeCA Transporte guardada.', 'puente-deca-woocommerce' ), 'updated' );
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
        $missing  = self::missing_basic_configuration( $settings );
        settings_errors( 'pdeca_woo' );
        ?>
        <div class="wrap">
            <h1><?php esc_html_e( 'DeCA Transporte', 'puente-deca-woocommerce' ); ?></h1>
            <p><?php esc_html_e( 'Conecta tus pedidos WooCommerce con DeCA Transporte. Este conector forma parte de Cargo Connect.', 'puente-deca-woocommerce' ); ?> <a href="https://kairoseth.com/products/kairoseth-cargo" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Ver planes y producto', 'puente-deca-woocommerce' ); ?></a>.</p>

            <?php if ( empty( $missing ) ) : ?>
                <div class="notice notice-success inline"><p><strong><?php esc_html_e( 'Configuración básica completa.', 'puente-deca-woocommerce' ); ?></strong> <?php esc_html_e( 'Ya puedes probar la conexión y generar tu primer DeCA desde un pedido.', 'puente-deca-woocommerce' ); ?></p></div>
            <?php else : ?>
                <div class="notice notice-warning inline"><p><strong><?php esc_html_e( 'Falta completar la configuración básica:', 'puente-deca-woocommerce' ); ?></strong> <?php echo esc_html( implode( ', ', $missing ) ); ?>.</p></div>
            <?php endif; ?>

            <h2><?php esc_html_e( 'Primer DeCA en 3 pasos', 'puente-deca-woocommerce' ); ?></h2>
            <ol>
                <li><?php esc_html_e( 'Completa y guarda los datos básicos de esta pantalla.', 'puente-deca-woocommerce' ); ?></li>
                <li><?php esc_html_e( 'Pulsa “Probar conexión con DeCA Transporte”.', 'puente-deca-woocommerce' ); ?></li>
                <li><?php esc_html_e( 'Abre un pedido, completa sus datos de transporte y usa “Generar / actualizar DeCA”.', 'puente-deca-woocommerce' ); ?></li>
            </ol>

            <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
                <input type="hidden" name="action" value="pdeca_woo_save_settings">
                <?php wp_nonce_field( 'pdeca_woo_save_settings' ); ?>

                <h2><?php esc_html_e( 'Configuración básica', 'puente-deca-woocommerce' ); ?></h2>
                <table class="form-table" role="presentation">
                    <tr><th><label for="pdeca-endpoint"><?php esc_html_e( 'Endpoint DeCA Transporte', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-endpoint" name="endpoint" type="url" required value="<?php echo esc_attr( $settings['endpoint'] ); ?>" placeholder="https://kairoseth.com/api/deca"><p class="description"><?php esc_html_e( 'Normalmente no necesitas cambiar este valor.', 'puente-deca-woocommerce' ); ?></p></td></tr>
                    <tr><th><label for="pdeca-api-key"><?php esc_html_e( 'Clave API de Cargo Connect', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-api-key" name="api_key" type="password" autocomplete="new-password" value="" placeholder="<?php echo esc_attr( PDECA_Woo_Secret_Store::get() ? __( 'Guardada de forma segura — deja vacío para conservarla', 'puente-deca-woocommerce' ) : __( 'Pendiente de configurar', 'puente-deca-woocommerce' ) ); ?>"><p class="description"><?php esc_html_e( 'La clave se cifra localmente y no se vuelve a mostrar.', 'puente-deca-woocommerce' ); ?></p><label><input type="checkbox" name="clear_api_key" value="1"> <?php esc_html_e( 'Eliminar la clave API guardada', 'puente-deca-woocommerce' ); ?></label></td></tr>
                    <tr><th><label for="pdeca-shipper-name"><?php esc_html_e( 'Nombre legal del cargador', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-shipper-name" name="shipper_name" type="text" required value="<?php echo esc_attr( $settings['shipper_name'] ); ?>"></td></tr>
                    <tr><th><label for="pdeca-shipper-tax"><?php esc_html_e( 'NIF/CIF del cargador', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-shipper-tax" name="shipper_tax_id" type="text" required value="<?php echo esc_attr( $settings['shipper_tax_id'] ); ?>"></td></tr>
                    <tr><th><label for="pdeca-shipper-address"><?php esc_html_e( 'Dirección del cargador', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-shipper-address" name="shipper_address" type="text" required value="<?php echo esc_attr( $settings['shipper_address'] ); ?>"></td></tr>
                    <tr><th><label for="pdeca-origin"><?php esc_html_e( 'Origen de carga por defecto', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-origin" name="origin" type="text" required value="<?php echo esc_attr( $settings['origin'] ); ?>"></td></tr>
                    <tr><th><label for="pdeca-carrier-name"><?php esc_html_e( 'Transportista por defecto', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-carrier-name" name="carrier_name" type="text" value="<?php echo esc_attr( $settings['carrier_name'] ); ?>"><p class="description"><?php esc_html_e( 'Opcional si el transportista se indica en cada pedido.', 'puente-deca-woocommerce' ); ?></p></td></tr>
                    <tr><th><label for="pdeca-carrier-tax"><?php esc_html_e( 'NIF/CIF del transportista por defecto', 'puente-deca-woocommerce' ); ?></label></th><td><input class="regular-text" id="pdeca-carrier-tax" name="carrier_tax_id" type="text" value="<?php echo esc_attr( $settings['carrier_tax_id'] ); ?>"></td></tr>
                </table>

                <details style="margin:20px 0;max-width:960px;">
                    <summary style="cursor:pointer;font-size:14px;"><strong><?php esc_html_e( 'Opciones avanzadas', 'puente-deca-woocommerce' ); ?></strong> — <?php esc_html_e( 'mapeo de campos, automatización y timeout', 'puente-deca-woocommerce' ); ?></summary>
                    <table class="form-table" role="presentation">
                        <?php
                        $meta_fields = array(
                            'carrier_name_meta_key'         => __( 'Meta del nombre del transportista', 'puente-deca-woocommerce' ),
                            'carrier_tax_id_meta_key'       => __( 'Meta del NIF/CIF del transportista', 'puente-deca-woocommerce' ),
                            'transport_date_meta_key'       => __( 'Meta de la fecha de transporte', 'puente-deca-woocommerce' ),
                            'tractor_registration_meta_key' => __( 'Meta de la matrícula tractora', 'puente-deca-woocommerce' ),
                            'trailer_registration_meta_key' => __( 'Meta de la matrícula del remolque', 'puente-deca-woocommerce' ),
                            'special_authorization_meta_key'=> __( 'Meta de autorización especial', 'puente-deca-woocommerce' ),
                            'weight_meta_key'               => __( 'Meta del peso del envío (kg)', 'puente-deca-woocommerce' ),
                        );
                        foreach ( $meta_fields as $key => $label ) :
                            ?>
                            <tr><th><label for="pdeca-<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $label ); ?></label></th><td><input class="regular-text" id="pdeca-<?php echo esc_attr( $key ); ?>" name="<?php echo esc_attr( $key ); ?>" type="text" value="<?php echo esc_attr( $settings[ $key ] ); ?>"></td></tr>
                        <?php endforeach; ?>
                        <tr><th><?php esc_html_e( 'Estados automáticos', 'puente-deca-woocommerce' ); ?></th><td><?php foreach ( $statuses as $key => $label ) : $slug = preg_replace( '/^wc-/', '', $key ); ?><label style="display:block"><input type="checkbox" name="auto_statuses[]" value="<?php echo esc_attr( $key ); ?>" <?php checked( in_array( $slug, $settings['auto_statuses'], true ) ); ?>> <?php echo esc_html( $label ); ?></label><?php endforeach; ?><p class="description"><?php esc_html_e( 'Déjalos todos sin marcar para trabajar manualmente. Si falta un dato obligatorio, la generación se detendrá con un error útil.', 'puente-deca-woocommerce' ); ?></p></td></tr>
                        <tr><th><label for="pdeca-timeout"><?php esc_html_e( 'Timeout HTTP (segundos)', 'puente-deca-woocommerce' ); ?></label></th><td><input id="pdeca-timeout" name="request_timeout" type="number" min="5" max="30" value="<?php echo esc_attr( $settings['request_timeout'] ); ?>"></td></tr>
                    </table>
                </details>

                <?php submit_button( __( 'Guardar configuración', 'puente-deca-woocommerce' ) ); ?>
            </form>

            <hr>
            <h2><?php esc_html_e( 'Comprobar conexión', 'puente-deca-woocommerce' ); ?></h2>
            <p><?php esc_html_e( 'Después de guardar los datos básicos, comprueba la conexión antes de generar el primer DeCA.', 'puente-deca-woocommerce' ); ?></p>
            <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
                <input type="hidden" name="action" value="pdeca_woo_test_connection">
                <?php wp_nonce_field( 'pdeca_woo_test_connection' ); ?>
                <?php submit_button( __( 'Probar conexión con DeCA Transporte', 'puente-deca-woocommerce' ), 'secondary', 'submit', false ); ?>
            </form>
        </div>
        <?php
    }
}
