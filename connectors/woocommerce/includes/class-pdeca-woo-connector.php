<?php

defined( 'ABSPATH' ) || exit;

final class PDECA_Woo_Connector {
    const META_SHIPMENT_ID = '_pdeca_shipment_id';
    const META_DOCUMENT_ID = '_pdeca_document_id';
    const META_ACCESS_URL  = '_pdeca_access_url';
    const META_STATUS      = '_pdeca_status';
    const META_LAST_ERROR  = '_pdeca_last_error';

    private static $instance;

    public static function instance() {
        if ( ! self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function boot() {
        PDECA_Woo_Settings::register();
        add_action( 'pdeca_woo_process_order', array( $this, 'process_order' ), 10, 1 );
        add_action( 'woocommerce_order_status_changed', array( $this, 'on_status_changed' ), 10, 4 );
        add_filter( 'woocommerce_order_actions', array( $this, 'order_actions' ) );
        add_action( 'woocommerce_order_action_pdeca_generate', array( $this, 'manual_generate' ) );
        add_action( 'woocommerce_admin_order_data_after_order_details', array( $this, 'render_order_panel' ), 10, 1 );
    }

    public function order_actions( $actions ) {
        $actions['pdeca_generate'] = __( 'Generate / update DeCA', 'puente-deca-woocommerce' );
        return $actions;
    }

    public function render_order_panel( $order ) {
        if ( ! $order instanceof WC_Order ) {
            return;
        }

        $status      = sanitize_key( (string) $order->get_meta( self::META_STATUS, true ) );
        $shipment_id = sanitize_text_field( (string) $order->get_meta( self::META_SHIPMENT_ID, true ) );
        $document_id = sanitize_text_field( (string) $order->get_meta( self::META_DOCUMENT_ID, true ) );
        $access_url  = esc_url( (string) $order->get_meta( self::META_ACCESS_URL, true ) );
        $last_error  = sanitize_text_field( (string) $order->get_meta( self::META_LAST_ERROR, true ) );

        $status_labels = array(
            'ready'        => __( 'Ready', 'puente-deca-woocommerce' ),
            'ready-reused' => __( 'Ready · no changes', 'puente-deca-woocommerce' ),
            'error'        => __( 'Needs attention', 'puente-deca-woocommerce' ),
        );
        $status_label = isset( $status_labels[ $status ] )
            ? $status_labels[ $status ]
            : __( 'Not generated yet', 'puente-deca-woocommerce' );

        echo '<div class="pdeca-order-summary" style="clear:both;padding-top:12px">';
        echo '<h4>' . esc_html__( 'DeCA Transporte', 'puente-deca-woocommerce' ) . '</h4>';
        echo '<p><strong>' . esc_html__( 'Status:', 'puente-deca-woocommerce' ) . '</strong> ' . esc_html( $status_label ) . '</p>';

        if ( '' !== $document_id ) {
            echo '<p><strong>' . esc_html__( 'Current DeCA:', 'puente-deca-woocommerce' ) . '</strong> ' . esc_html( $document_id ) . '</p>';
        }

        if ( '' !== $shipment_id ) {
            echo '<p><strong>' . esc_html__( 'Shipment:', 'puente-deca-woocommerce' ) . '</strong> ' . esc_html( $shipment_id ) . '</p>';
        }

        if ( '' !== $access_url ) {
            echo '<p><a class="button" href="' . esc_url( $access_url ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Open DeCA document', 'puente-deca-woocommerce' ) . '</a></p>';
        }

        if ( '' !== $last_error ) {
            echo '<p><strong>' . esc_html__( 'Last error:', 'puente-deca-woocommerce' ) . '</strong> ' . esc_html( $last_error ) . '</p>';
        }

        echo '<p class="description">' . esc_html__( 'Use the Order actions menu to generate or update this DeCA.', 'puente-deca-woocommerce' ) . '</p>';
        echo '</div>';
    }

    public function manual_generate( $order ) {
        if ( $order instanceof WC_Order ) {
            $this->queue_order( $order->get_id() );
        }
    }

    public function on_status_changed( $order_id, $from, $to, $order ) {
        $settings = PDECA_Woo_Settings::get();
        if ( in_array( (string) $to, $settings['auto_statuses'], true ) ) {
            $this->queue_order( $order_id );
        }
    }

    private function queue_order( $order_id ) {
        $order_id = absint( $order_id );
        if ( ! $order_id ) {
            return;
        }

        if ( function_exists( 'as_enqueue_async_action' ) ) {
            as_enqueue_async_action( 'pdeca_woo_process_order', array( $order_id ), 'puente-deca', true );
            return;
        }

        if ( ! wp_next_scheduled( 'pdeca_woo_process_order', array( $order_id ) ) ) {
            wp_schedule_single_event( time() + 5, 'pdeca_woo_process_order', array( $order_id ) );
        }
    }

    private function fail( WC_Order $order, WP_Error $error ) {
        $message = sanitize_text_field( $error->get_error_message() );
        $order->update_meta_data( self::META_STATUS, 'error' );
        $order->update_meta_data( self::META_LAST_ERROR, $error->get_error_code() . ': ' . $message );
        $order->save();
        $order->add_order_note( sprintf( __( 'DeCA Transporte: %s', 'puente-deca-woocommerce' ), $message ) );
    }

    public function process_order( $order_id ) {
        $order = wc_get_order( absint( $order_id ) );
        if ( ! $order instanceof WC_Order ) {
            return;
        }

        $settings = PDECA_Woo_Settings::get();
        $client   = new PDECA_Woo_Client( $settings );
        if ( ! $client->configured() ) {
            $this->fail( $order, new WP_Error( 'pdeca_not_configured', __( 'DeCA Transporte is not fully configured.', 'puente-deca-woocommerce' ) ) );
            return;
        }

        $payload     = PDECA_Woo_Order_Payload::build( $order, $settings );
        $shipment_id = trim( (string) $order->get_meta( self::META_SHIPMENT_ID, true ) );

        if ( '' === $shipment_id ) {
            $idempotency = sprintf( 'woo:%d:order:%d:shipment:v1', get_current_blog_id(), $order->get_id() );
            $shipment    = $client->create_shipment( $payload, $idempotency );
            if ( is_wp_error( $shipment ) ) {
                $this->fail( $order, $shipment );
                return;
            }
            $shipment_id = isset( $shipment['shipmentId'] ) ? sanitize_text_field( $shipment['shipmentId'] ) : '';
            if ( '' === $shipment_id ) {
                $this->fail( $order, new WP_Error( 'pdeca_missing_shipment_id', __( 'DeCA Transporte did not return a shipment ID.', 'puente-deca-woocommerce' ) ) );
                return;
            }
            $order->update_meta_data( self::META_SHIPMENT_ID, $shipment_id );
            $order->save();
        } else {
            $updated = $client->update_shipment( $shipment_id, $payload );
            if ( is_wp_error( $updated ) ) {
                $this->fail( $order, $updated );
                return;
            }
        }

        $generated = $client->generate_deca( $shipment_id );
        if ( is_wp_error( $generated ) ) {
            $this->fail( $order, $generated );
            return;
        }

        $document = isset( $generated['document'] ) && is_array( $generated['document'] ) ? $generated['document'] : array();
        $document_id = isset( $document['documentId'] ) ? sanitize_text_field( $document['documentId'] ) : '';
        $access_url  = isset( $document['accessUrl'] ) ? esc_url_raw( $document['accessUrl'] ) : '';

        if ( '' === $document_id || '' === $access_url ) {
            $this->fail( $order, new WP_Error( 'pdeca_invalid_document_response', __( 'DeCA Transporte returned incomplete document metadata.', 'puente-deca-woocommerce' ) ) );
            return;
        }

        $order->update_meta_data( self::META_DOCUMENT_ID, $document_id );
        $order->update_meta_data( self::META_ACCESS_URL, $access_url );
        $order->update_meta_data( self::META_STATUS, ! empty( $generated['reused'] ) ? 'ready-reused' : 'ready' );
        $order->delete_meta_data( self::META_LAST_ERROR );
        $order->save();

        $order->add_order_note(
            sprintf(
                __( 'DeCA Transporte ready: %s', 'puente-deca-woocommerce' ),
                $document_id
            )
        );
    }
}
