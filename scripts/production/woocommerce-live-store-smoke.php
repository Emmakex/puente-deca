<?php

declare(strict_types=1);

function pdeca_live_fail($code, $details = array())
{
    fwrite(
        STDERR,
        json_encode(
            array_merge(
                array(
                    'status' => 'error',
                    'check' => 'woocommerce-live-store-smoke',
                    'code' => (string) $code,
                ),
                is_array($details) ? $details : array()
            ),
            JSON_UNESCAPED_SLASHES
        ) . PHP_EOL
    );
    exit(1);
}

function pdeca_live_require_text($value, $name)
{
    $value = trim((string) $value);
    if ($value === '') {
        pdeca_live_fail(
            'CONFIGURATION_INVALID',
            array('field' => (string) $name)
        );
    }
    return $value;
}

function pdeca_live_payload_shape(array $payload)
{
    $requiredPaths = array(
        array('externalReference'),
        array('contractualShipper'),
        array('effectiveCarrier'),
        array('route'),
        array('goods'),
        array('transport'),
    );

    foreach ($requiredPaths as $path) {
        $cursor = $payload;
        foreach ($path as $segment) {
            if (!is_array($cursor) || !array_key_exists($segment, $cursor)) {
                return false;
            }
            $cursor = $cursor[$segment];
        }
    }

    return true;
}

$root = pdeca_live_require_text(
    getenv('PDECA_WP_ROOT'),
    'PDECA_WP_ROOT'
);
$wpLoad = rtrim($root, DIRECTORY_SEPARATOR)
    . DIRECTORY_SEPARATOR
    . 'wp-load.php';

if (!is_file($wpLoad)) {
    pdeca_live_fail('WORDPRESS_BOOTSTRAP_NOT_FOUND');
}

if (!defined('WP_USE_THEMES')) {
    define('WP_USE_THEMES', false);
}

require_once $wpLoad;

if (!class_exists('WooCommerce')) {
    pdeca_live_fail('WOOCOMMERCE_NOT_ACTIVE');
}
if (
    !defined('PDECA_WOO_VERSION')
    || !class_exists('PDECA_Woo_Settings')
    || !class_exists('PDECA_Woo_Secret_Store')
    || !class_exists('PDECA_Woo_Client')
    || !class_exists('PDECA_Woo_Order_Payload')
) {
    pdeca_live_fail('KAIROSETH_CARGO_CONNECTOR_NOT_ACTIVE');
}

global $wp_version;
$wordpressVersion = isset($wp_version)
    ? (string) $wp_version
    : '';
$woocommerceVersion = defined('WC_VERSION')
    ? (string) WC_VERSION
    : '';

if (
    $wordpressVersion === ''
    || version_compare($wordpressVersion, '6.5', '<')
) {
    pdeca_live_fail(
        'WORDPRESS_VERSION_UNSUPPORTED',
        array('version' => $wordpressVersion)
    );
}
if (
    $woocommerceVersion === ''
    || version_compare($woocommerceVersion, '8.2', '<')
) {
    pdeca_live_fail(
        'WOOCOMMERCE_VERSION_UNSUPPORTED',
        array('version' => $woocommerceVersion)
    );
}

$settings = PDECA_Woo_Settings::get();
$endpoint = isset($settings['endpoint'])
    ? trim((string) $settings['endpoint'])
    : '';

if (strpos($endpoint, 'https://') !== 0) {
    pdeca_live_fail('CONNECTOR_ENDPOINT_INVALID');
}

$secretConfigured =
    PDECA_Woo_Secret_Store::get() !== '';

if (!$secretConfigured) {
    pdeca_live_fail('CONNECTOR_CREDENTIAL_MISSING');
}

$client = new PDECA_Woo_Client($settings);
if (!$client->configured()) {
    pdeca_live_fail('CONNECTOR_NOT_CONFIGURED');
}

$connection = $client->test_connection();
if (is_wp_error($connection)) {
    pdeca_live_fail(
        'CARGO_CONNECTION_FAILED',
        array(
            'remoteCode' =>
                (string) $connection->get_error_code(),
        )
    );
}
if (!is_array($connection)) {
    pdeca_live_fail('CARGO_CONNECTION_RESPONSE_INVALID');
}

$orderSmoke = array(
    'requested' => false,
    'mapped' => false,
    'requiredFactsPresent' => null,
    'missingFacts' => array(),
);

$orderIdRaw = trim(
    (string) getenv('PDECA_WOO_SMOKE_ORDER_ID')
);

if ($orderIdRaw !== '') {
    if (!ctype_digit($orderIdRaw) || (int) $orderIdRaw <= 0) {
        pdeca_live_fail('SMOKE_ORDER_ID_INVALID');
    }

    $orderSmoke['requested'] = true;
    $order = wc_get_order((int) $orderIdRaw);

    if (!$order instanceof WC_Order) {
        pdeca_live_fail('SMOKE_ORDER_NOT_FOUND');
    }

    $payload =
        PDECA_Woo_Order_Payload::build(
            $order,
            $settings
        );

    if (
        !is_array($payload)
        || !pdeca_live_payload_shape($payload)
    ) {
        pdeca_live_fail('SMOKE_ORDER_PAYLOAD_INVALID');
    }

    $missing = array();

    $checks = array(
        'contractualShipper.legalName' =>
            isset($payload['contractualShipper']['legalName'])
                ? trim((string) $payload['contractualShipper']['legalName'])
                : '',
        'contractualShipper.taxId' =>
            isset($payload['contractualShipper']['taxId'])
                ? trim((string) $payload['contractualShipper']['taxId'])
                : '',
        'contractualShipper.address' =>
            isset($payload['contractualShipper']['address'])
                ? trim((string) $payload['contractualShipper']['address'])
                : '',
        'effectiveCarrier.legalName' =>
            isset($payload['effectiveCarrier']['legalName'])
                ? trim((string) $payload['effectiveCarrier']['legalName'])
                : '',
        'effectiveCarrier.taxId' =>
            isset($payload['effectiveCarrier']['taxId'])
                ? trim((string) $payload['effectiveCarrier']['taxId'])
                : '',
        'route.origin' =>
            isset($payload['route']['origin'])
                ? trim((string) $payload['route']['origin'])
                : '',
        'route.destination' =>
            isset($payload['route']['destination'])
                ? trim((string) $payload['route']['destination'])
                : '',
        'goods.nature' =>
            isset($payload['goods']['nature'])
                ? trim((string) $payload['goods']['nature'])
                : '',
        'transport.date' =>
            isset($payload['transport']['date'])
                ? trim((string) $payload['transport']['date'])
                : '',
        'transport.vehicle.tractorRegistration' =>
            isset($payload['transport']['vehicle']['tractorRegistration'])
                ? trim((string) $payload['transport']['vehicle']['tractorRegistration'])
                : '',
    );

    foreach ($checks as $name => $value) {
        if ($value === '') {
            $missing[] = $name;
        }
    }

    $hasMeasure =
        isset($payload['goods']['weight'])
        || isset($payload['goods']['alternativeMeasure']);

    if (!$hasMeasure) {
        $missing[] = 'goods.weightOrAlternativeMeasure';
    }

    $orderSmoke = array(
        'requested' => true,
        'mapped' => true,
        'requiredFactsPresent' => count($missing) === 0,
        'missingFacts' => $missing,
    );
}

fwrite(
    STDOUT,
    json_encode(
        array(
            'status' => 'ok',
            'check' => 'woocommerce-live-store-smoke',
            'readOnly' => true,
            'wordpressVersion' => $wordpressVersion,
            'woocommerceVersion' => $woocommerceVersion,
            'connectorVersion' => (string) PDECA_WOO_VERSION,
            'endpointHttps' => true,
            'credentialConfigured' => true,
            'cargoReadCheck' => true,
            'orderMapping' => $orderSmoke,
        ),
        JSON_UNESCAPED_SLASHES
    ) . PHP_EOL
);
