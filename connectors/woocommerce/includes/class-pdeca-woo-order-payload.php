<?php

defined( 'ABSPATH' ) || exit;

final class PDECA_Woo_Order_Payload {
    private static function meta( WC_Order $order, $key ) {
        $key = trim( (string) $key );
        return '' === $key ? '' : trim( (string) $order->get_meta( $key, true ) );
    }

    private static function destination( WC_Order $order ) {
        $parts = array_filter(
            array(
                $order->get_shipping_address_1(),
                $order->get_shipping_address_2(),
                $order->get_shipping_postcode(),
                $order->get_shipping_city(),
                $order->get_shipping_state(),
                $order->get_shipping_country(),
            )
        );

        if ( empty( $parts ) ) {
            $parts = array_filter(
                array(
                    $order->get_billing_address_1(),
                    $order->get_billing_address_2(),
                    $order->get_billing_postcode(),
                    $order->get_billing_city(),
                    $order->get_billing_state(),
                    $order->get_billing_country(),
                )
            );
        }

        return implode( ', ', array_map( 'sanitize_text_field', $parts ) );
    }

    private static function goods_nature( WC_Order $order ) {
        $names = array();
        foreach ( $order->get_items( 'line_item' ) as $item ) {
            $name = trim( (string) $item->get_name() );
            if ( '' !== $name ) {
                $names[] = $name;
            }
        }
        return implode( '; ', array_values( array_unique( $names ) ) );
    }

    private static function weight_kg( WC_Order $order, array $settings ) {
        $from_meta = self::meta( $order, $settings['weight_meta_key'] );
        if ( '' !== $from_meta && is_numeric( str_replace( ',', '.', $from_meta ) ) ) {
            $number = (float) str_replace( ',', '.', $from_meta );
            return $number > 0 ? $number : null;
        }

        $total = 0.0;
        foreach ( $order->get_items( 'line_item' ) as $item ) {
            $product = $item->get_product();
            if ( ! $product ) {
                return null;
            }
            $weight = $product->get_weight();
            if ( '' === $weight || ! is_numeric( $weight ) ) {
                return null;
            }
            $total += (float) wc_get_weight( (float) $weight, 'kg' ) * max( 1, (float) $item->get_quantity() );
        }

        return $total > 0 ? round( $total, 3 ) : null;
    }

    private static function configured_or_meta( WC_Order $order, array $settings, $setting_key, $meta_key_setting ) {
        $meta = self::meta( $order, $settings[ $meta_key_setting ] );
        if ( '' !== $meta ) {
            return $meta;
        }
        return trim( (string) $settings[ $setting_key ] );
    }

    public static function build( WC_Order $order, array $settings ) {
        $weight = self::weight_kg( $order, $settings );
        $trailer = self::meta( $order, $settings['trailer_registration_meta_key'] );
        $special = self::meta( $order, $settings['special_authorization_meta_key'] );
        $note    = trim( (string) $order->get_customer_note() );

        $payload = array(
            'externalReference' => sprintf( 'woo:%d:order:%d', get_current_blog_id(), $order->get_id() ),
            'contractualShipper' => array(
                'legalName' => trim( (string) $settings['shipper_name'] ),
                'taxId'     => trim( (string) $settings['shipper_tax_id'] ),
                'address'   => trim( (string) $settings['shipper_address'] ),
            ),
            'effectiveCarrier' => array(
                'legalName' => self::configured_or_meta( $order, $settings, 'carrier_name', 'carrier_name_meta_key' ),
                'taxId'     => self::configured_or_meta( $order, $settings, 'carrier_tax_id', 'carrier_tax_id_meta_key' ),
            ),
            'route' => array(
                'origin'      => trim( (string) $settings['origin'] ),
                'destination' => self::destination( $order ),
            ),
            'goods' => array(
                'nature' => self::goods_nature( $order ),
            ),
            'transport' => array(
                'date' => self::meta( $order, $settings['transport_date_meta_key'] ),
                'vehicle' => array(
                    'tractorRegistration' => self::meta( $order, $settings['tractor_registration_meta_key'] ),
                    'trailerRegistration' => '' === $trailer ? null : $trailer,
                ),
                'specialTrafficAuthorization' => '' === $special ? null : $special,
            ),
            'observations' => '' === $note ? null : $note,
        );

        if ( null !== $weight ) {
            $payload['goods']['weight'] = array(
                'value' => $weight,
                'unit'  => 'kg',
            );
        }

        return apply_filters( 'pdeca_woo_shipment_payload', $payload, $order, $settings );
    }
}
