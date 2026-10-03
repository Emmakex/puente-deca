<?php

defined( 'ABSPATH' ) || exit;

final class PDECA_Woo_Client {
    private $endpoint;
    private $token;
    private $timeout;

    public function __construct( array $settings ) {
        $this->endpoint = untrailingslashit( (string) $settings['endpoint'] );
        $this->token    = PDECA_Woo_Secret_Store::get();
        $this->timeout  = max( 5, min( 30, (int) $settings['request_timeout'] ) );
    }

    public function configured() {
        return 0 === strpos( $this->endpoint, 'https://' ) && '' !== $this->token;
    }

    public function test_connection() {
        return $this->request(
            'GET',
            '/v1/shipments?limit=1'
        );
    }

    public function create_shipment( array $payload, $idempotency_key ) {
        return $this->request(
            'POST',
            '/v1/shipments',
            $payload,
            array( 'Idempotency-Key' => (string) $idempotency_key )
        );
    }

    public function update_shipment( $shipment_id, array $payload ) {
        return $this->request(
            'PUT',
            '/v1/shipments/' . rawurlencode( (string) $shipment_id ),
            $payload
        );
    }

    public function generate_deca( $shipment_id ) {
        return $this->request(
            'POST',
            '/v1/shipments/' . rawurlencode( (string) $shipment_id ) . '/deca'
        );
    }

    private function request( $method, $path, array $body = null, array $extra_headers = array() ) {
        if ( ! $this->configured() ) {
            return new WP_Error( 'pdeca_not_configured', __( 'Puente DeCA is not fully configured.', 'puente-deca-woocommerce' ) );
        }

        $url = $this->endpoint . $path;
        if ( 0 !== strpos( $url, 'https://' ) ) {
            return new WP_Error( 'pdeca_https_required', __( 'Puente DeCA requires an HTTPS endpoint.', 'puente-deca-woocommerce' ) );
        }

        $headers = array_merge(
            array(
                'Authorization'       => 'Bearer ' . $this->token,
                'Accept'              => 'application/json',
                'Content-Type'        => 'application/json',
                'X-Connector-Version' => 'woocommerce/' . PDECA_WOO_VERSION,
            ),
            $extra_headers
        );

        $args = array(
            'method'      => strtoupper( $method ),
            'timeout'     => $this->timeout,
            'redirection' => 0,
            'headers'     => $headers,
            'user-agent'  => 'PuenteDeCA-WooCommerce/' . PDECA_WOO_VERSION . '; ' . home_url( '/' ),
        );

        if ( null !== $body ) {
            $args['body'] = wp_json_encode( $body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
        }

        $response = wp_remote_request( $url, $args );
        if ( is_wp_error( $response ) ) {
            return new WP_Error( 'pdeca_transport_error', __( 'Puente DeCA could not be reached.', 'puente-deca-woocommerce' ), array( 'cause' => $response->get_error_code() ) );
        }

        $status = (int) wp_remote_retrieve_response_code( $response );
        $raw    = (string) wp_remote_retrieve_body( $response );
        $json   = json_decode( $raw, true );

        if ( ! is_array( $json ) ) {
            return new WP_Error( 'pdeca_invalid_response', __( 'Puente DeCA returned an invalid response.', 'puente-deca-woocommerce' ), array( 'http_status' => $status ) );
        }

        if ( $status < 200 || $status >= 300 ) {
            $raw_code = isset( $json['error'] ) && is_string( $json['error'] ) ? $json['error'] : 'pdeca_api_error';
            $code     = sanitize_key( $raw_code );
            $message  = isset( $json['message'] ) ? sanitize_text_field( $json['message'] ) : __( 'Puente DeCA rejected the request.', 'puente-deca-woocommerce' );
            return new WP_Error( $code, $message, array( 'http_status' => $status, 'response' => $json ) );
        }

        return $json;
    }
}
