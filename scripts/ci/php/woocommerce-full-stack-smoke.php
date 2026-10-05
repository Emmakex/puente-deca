<?php

if (!defined('ABSPATH')) {
    fwrite(STDERR, "WordPress runtime is not loaded\n");
    exit(1);
}

if (!class_exists('WooCommerce') || !defined('WC_VERSION')) {
    fwrite(STDERR, "WooCommerce is not active\n");
    exit(1);
}

foreach (
    array(
        'PDECA_Woo_Settings',
        'PDECA_Woo_Secret_Store',
        'PDECA_Woo_Order_Payload',
        'PDECA_Woo_Connector',
    ) as $class
) {
    if (!class_exists($class)) {
        fwrite(STDERR, "Kairoseth Cargo connector class missing: {$class}\n");
        exit(1);
    }
}

$fail = static function (string $message): void {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
};

$wpVersion = (string) get_bloginfo('version');
$wooVersion = (string) WC_VERSION;

if (version_compare($wpVersion, '6.5', '<')) {
    $fail('WordPress version below supported minimum');
}
if (version_compare($wooVersion, '8.2', '<')) {
    $fail('WooCommerce version below supported minimum');
}

$settings = array(
    'endpoint' => 'https://kairoseth.com/api/deca',
    'shipper_name' => 'Kairoseth Cargo Internal QA Shipper SL',
    'shipper_tax_id' => 'B00000001',
    'shipper_address' => 'Synthetic QA origin address',
    'origin' => 'Barcelona QA Depot',
    'carrier_name' => 'Kairoseth Cargo Internal QA Carrier SL',
    'carrier_tax_id' => 'B00000002',
    'carrier_name_meta_key' => '_pdeca_carrier_name',
    'carrier_tax_id_meta_key' => '_pdeca_carrier_tax_id',
    'transport_date_meta_key' => '_pdeca_transport_date',
    'tractor_registration_meta_key' => '_pdeca_tractor_registration',
    'trailer_registration_meta_key' => '_pdeca_trailer_registration',
    'special_authorization_meta_key' => '_pdeca_special_traffic_authorization',
    'weight_meta_key' => '_pdeca_weight_kg',
    'auto_statuses' => array(),
    'request_timeout' => 5,
);

update_option(PDECA_Woo_Settings::OPTION, $settings, false);

$syntheticSecret = 'pdeca_internal_full_stack_secret_0123456789';
if (!PDECA_Woo_Secret_Store::save($syntheticSecret)) {
    $fail('Connector secret could not be encrypted in real WordPress runtime');
}
if (PDECA_Woo_Secret_Store::get() !== $syntheticSecret) {
    $fail('Connector secret encryption round-trip failed');
}

$product = new WC_Product_Simple();
$product->set_name('Synthetic DeCA QA Cargo');
$product->set_status('publish');
$product->set_regular_price('25.00');
$product->set_weight('50');
$productId = (int) $product->save();

if ($productId <= 0) {
    $fail('Synthetic WooCommerce product could not be created');
}

$order = wc_create_order();
if (!$order instanceof WC_Order) {
    $fail('Synthetic WooCommerce order could not be created');
}

try {
    $order->add_product($product, 2);

    $address = array(
        'first_name' => 'Internal',
        'last_name' => 'QA',
        'company' => 'Kairoseth Cargo QA',
        'address_1' => 'Synthetic destination address',
        'address_2' => '',
        'city' => 'Madrid',
        'state' => 'M',
        'postcode' => '28001',
        'country' => 'ES',
        'email' => 'qa@example.invalid',
        'phone' => '000000000',
    );

    $order->set_address($address, 'billing');
    $order->set_address($address, 'shipping');
    $order->set_customer_note('Synthetic internal DeCA acceptance order');
    $order->update_meta_data('_pdeca_transport_date', '2026-10-05');
    $order->update_meta_data('_pdeca_tractor_registration', '0000QAQ');
    $order->update_meta_data('_pdeca_trailer_registration', 'R0000QAQ');
    $order->update_meta_data('_pdeca_weight_kg', '100');
    $order->calculate_totals();
    $order->save();

    $payload = PDECA_Woo_Order_Payload::build(
        $order,
        PDECA_Woo_Settings::get()
    );

    $checks = array(
        'externalReference' => $payload['externalReference'] ?? '',
        'contractualShipper.legalName' => $payload['contractualShipper']['legalName'] ?? '',
        'contractualShipper.taxId' => $payload['contractualShipper']['taxId'] ?? '',
        'contractualShipper.address' => $payload['contractualShipper']['address'] ?? '',
        'effectiveCarrier.legalName' => $payload['effectiveCarrier']['legalName'] ?? '',
        'effectiveCarrier.taxId' => $payload['effectiveCarrier']['taxId'] ?? '',
        'route.origin' => $payload['route']['origin'] ?? '',
        'route.destination' => $payload['route']['destination'] ?? '',
        'goods.nature' => $payload['goods']['nature'] ?? '',
        'transport.date' => $payload['transport']['date'] ?? '',
        'transport.vehicle.tractorRegistration' => $payload['transport']['vehicle']['tractorRegistration'] ?? '',
    );

    foreach ($checks as $name => $value) {
        if (trim((string) $value) === '') {
            $fail("Mapped payload is missing {$name}");
        }
    }

    $weight = $payload['goods']['weight']['value'] ?? null;
    if (!is_numeric($weight) || (float) $weight !== 100.0) {
        $fail('Mapped payload weight is invalid');
    }

    $hpos = null;
    if (class_exists('\\Automattic\\WooCommerce\\Utilities\\OrderUtil')) {
        $hpos = \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled();
    }

    fwrite(
        STDOUT,
        json_encode(
            array(
                'status' => 'ok',
                'check' => 'woocommerce-full-stack-internal',
                'wordpressVersion' => $wpVersion,
                'woocommerceVersion' => $wooVersion,
                'connectorVersion' => defined('PDECA_WOO_VERSION') ? PDECA_WOO_VERSION : null,
                'secretRoundTrip' => true,
                'syntheticOrderCreated' => true,
                'payloadMapped' => true,
                'payloadContainsCustomerValues' => false,
                'hposEnabled' => $hpos,
            ),
            JSON_UNESCAPED_SLASHES
        ) . PHP_EOL
    );
} finally {
    if ($order instanceof WC_Order) {
        $order->delete(true);
    }
    if ($productId > 0) {
        wp_delete_post($productId, true);
    }
    PDECA_Woo_Secret_Store::save('');
    delete_option(PDECA_Woo_Settings::OPTION);
}
