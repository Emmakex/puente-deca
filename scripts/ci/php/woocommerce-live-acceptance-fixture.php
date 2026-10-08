<?php

if (!defined('ABSPATH')) {
    fwrite(STDERR, "WordPress runtime is not loaded\n");
    exit(1);
}

$fail = static function (string $message): void {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
};

if (!class_exists('WooCommerce') || !defined('WC_VERSION')) {
    $fail('WooCommerce is not active');
}
foreach (
    array(
        'PDECA_Woo_Settings',
        'PDECA_Woo_Secret_Store',
        'PDECA_Woo_Order_Payload',
    ) as $class
) {
    if (!class_exists($class)) {
        $fail("Kairoseth Cargo connector class missing: {$class}");
    }
}

$apiKey = trim((string) getenv('PDECA_ACCEPTANCE_API_KEY'));
if ($apiKey === '') {
    $fail('PDECA_ACCEPTANCE_API_KEY is required');
}

$settings = array(
    'endpoint' => 'https://kairoseth.com/api/deca',
    'shipper_name' => 'Kairoseth Cargo Acceptance Shipper SL',
    'shipper_tax_id' => 'B00000001',
    'shipper_address' => 'Synthetic acceptance origin address',
    'origin' => 'Barcelona Acceptance Depot',
    'carrier_name' => 'Kairoseth Cargo Acceptance Carrier SL',
    'carrier_tax_id' => 'B00000002',
    'carrier_name_meta_key' => '_pdeca_carrier_name',
    'carrier_tax_id_meta_key' => '_pdeca_carrier_tax_id',
    'transport_date_meta_key' => '_pdeca_transport_date',
    'tractor_registration_meta_key' => '_pdeca_tractor_registration',
    'trailer_registration_meta_key' => '_pdeca_trailer_registration',
    'special_authorization_meta_key' => '_pdeca_special_traffic_authorization',
    'weight_meta_key' => '_pdeca_weight_kg',
    'auto_statuses' => array(),
    'request_timeout' => 15,
);

update_option(PDECA_Woo_Settings::OPTION, $settings, false);
if (!PDECA_Woo_Secret_Store::save($apiKey)) {
    $fail('Connector credential could not be encrypted');
}
if (PDECA_Woo_Secret_Store::get() !== $apiKey) {
    $fail('Connector credential encryption round-trip failed');
}

$product = new WC_Product_Simple();
$product->set_name('Synthetic DeCA Acceptance Cargo');
$product->set_status('publish');
$product->set_regular_price('25.00');
$product->set_weight('50');
$productId = (int) $product->save();
if ($productId <= 0) {
    $fail('Synthetic WooCommerce product could not be created');
}

$order = wc_create_order();
if (!$order instanceof WC_Order) {
    wp_delete_post($productId, true);
    $fail('Synthetic WooCommerce order could not be created');
}

$order->add_product($product, 2);
$address = array(
    'first_name' => 'Synthetic',
    'last_name' => 'Acceptance',
    'company' => 'Kairoseth Cargo Acceptance',
    'address_1' => 'Synthetic destination address',
    'address_2' => '',
    'city' => 'Madrid',
    'state' => 'M',
    'postcode' => '28001',
    'country' => 'ES',
    'email' => 'acceptance@example.invalid',
    'phone' => '000000000',
);
$order->set_address($address, 'billing');
$order->set_address($address, 'shipping');
$order->set_customer_note('Synthetic Kairoseth-controlled DeCA acceptance order');
$order->update_meta_data('_pdeca_transport_date', gmdate('Y-m-d'));
$order->update_meta_data('_pdeca_tractor_registration', '0000QAQ');
$order->update_meta_data('_pdeca_trailer_registration', 'R0000QAQ');
$order->update_meta_data('_pdeca_weight_kg', '100');
$order->calculate_totals();
$order->save();

$payload = PDECA_Woo_Order_Payload::build($order, PDECA_Woo_Settings::get());
$required = array(
    $payload['contractualShipper']['legalName'] ?? '',
    $payload['contractualShipper']['taxId'] ?? '',
    $payload['contractualShipper']['address'] ?? '',
    $payload['effectiveCarrier']['legalName'] ?? '',
    $payload['effectiveCarrier']['taxId'] ?? '',
    $payload['route']['origin'] ?? '',
    $payload['route']['destination'] ?? '',
    $payload['goods']['nature'] ?? '',
    $payload['transport']['date'] ?? '',
    $payload['transport']['vehicle']['tractorRegistration'] ?? '',
);
foreach ($required as $value) {
    if (trim((string) $value) === '') {
        $fail('Synthetic order mapping is incomplete');
    }
}
if (!isset($payload['goods']['weight']['value'])) {
    $fail('Synthetic order mapping is missing weight');
}

fwrite(STDOUT, (string) $order->get_id() . PHP_EOL);
