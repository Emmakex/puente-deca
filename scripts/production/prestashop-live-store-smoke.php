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
                    'check' => 'prestashop-live-store-smoke',
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
    foreach (
        array(
            'externalReference',
            'contractualShipper',
            'effectiveCarrier',
            'route',
            'goods',
            'transport',
        ) as $key
    ) {
        if (!array_key_exists($key, $payload)) {
            return false;
        }
    }

    return true;
}

$root = pdeca_live_require_text(
    getenv('PDECA_PRESTASHOP_ROOT'),
    'PDECA_PRESTASHOP_ROOT'
);
$root = rtrim($root, DIRECTORY_SEPARATOR);

$config = $root
    . DIRECTORY_SEPARATOR
    . 'config'
    . DIRECTORY_SEPARATOR
    . 'config.inc.php';
$init = $root
    . DIRECTORY_SEPARATOR
    . 'init.php';

if (!is_file($config)) {
    pdeca_live_fail('PRESTASHOP_BOOTSTRAP_NOT_FOUND');
}

require_once $config;
if (is_file($init)) {
    require_once $init;
}

if (!defined('_PS_VERSION_')) {
    pdeca_live_fail('PRESTASHOP_VERSION_UNKNOWN');
}
if (!class_exists('Module')) {
    pdeca_live_fail('PRESTASHOP_MODULE_RUNTIME_MISSING');
}

$module = Module::getInstanceByName('puentedeca');
if (!$module || !is_object($module)) {
    pdeca_live_fail('KAIROSETH_CARGO_CONNECTOR_NOT_INSTALLED');
}
if (empty($module->active)) {
    pdeca_live_fail('KAIROSETH_CARGO_CONNECTOR_NOT_ACTIVE');
}
if (
    !class_exists('PDECAPrestaShopSecretStore')
    || !class_exists('PDECAPrestaShopClient')
    || !class_exists('PDECAPrestaShopOrderPayload')
) {
    pdeca_live_fail('KAIROSETH_CARGO_CONNECTOR_BOOTSTRAP_INCOMPLETE');
}

$prestaVersion = (string) _PS_VERSION_;
if (
    version_compare($prestaVersion, '1.7.8.0', '<')
    || version_compare($prestaVersion, '9.0.0', '>=')
) {
    pdeca_live_fail(
        'PRESTASHOP_VERSION_UNSUPPORTED',
        array('version' => $prestaVersion)
    );
}

$settings = $module->settings();
$endpoint = isset($settings['endpoint'])
    ? trim((string) $settings['endpoint'])
    : '';
$shopId = isset($settings['shop_id'])
    ? (int) $settings['shop_id']
    : 0;

if (
    $shopId <= 0
    || strpos($endpoint, 'https://') !== 0
) {
    pdeca_live_fail('CONNECTOR_SETTINGS_INVALID');
}

$secretConfigured =
    PDECAPrestaShopSecretStore::get(
        $shopId
    ) !== '';

if (!$secretConfigured) {
    pdeca_live_fail('CONNECTOR_CREDENTIAL_MISSING');
}

$client = new PDECAPrestaShopClient(
    array_merge(
        $settings,
        array(
            'module_version' =>
                defined('PuenteDeca::VERSION')
                    ? constant('PuenteDeca::VERSION')
                    : (string) $module->version,
        )
    )
);

if (!$client->configured()) {
    pdeca_live_fail('CONNECTOR_NOT_CONFIGURED');
}

try {
    $connection =
        $client->testConnection();
} catch (Exception $error) {
    pdeca_live_fail(
        'CARGO_CONNECTION_FAILED',
        array(
            'remoteClass' => get_class($error),
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
    (string) getenv(
        'PDECA_PRESTASHOP_SMOKE_ORDER_ID'
    )
);

if ($orderIdRaw !== '') {
    if (
        !ctype_digit($orderIdRaw)
        || (int) $orderIdRaw <= 0
    ) {
        pdeca_live_fail('SMOKE_ORDER_ID_INVALID');
    }

    $orderSmoke['requested'] = true;
    $order = new Order((int) $orderIdRaw);

    if (
        !Validate::isLoadedObject($order)
        || (int) $order->id_shop !== $shopId
    ) {
        pdeca_live_fail('SMOKE_ORDER_NOT_FOUND');
    }

    $existing =
        $module->getSyncRow(
            (int) $order->id
        );
    $logistics = is_array($existing)
        ? $existing
        : array();

    $payload =
        PDECAPrestaShopOrderPayload::build(
            $order,
            $settings,
            $logistics
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
        $missing[] =
            'goods.weightOrAlternativeMeasure';
    }

    $orderSmoke = array(
        'requested' => true,
        'mapped' => true,
        'requiredFactsPresent' =>
            count($missing) === 0,
        'missingFacts' => $missing,
    );
}

fwrite(
    STDOUT,
    json_encode(
        array(
            'status' => 'ok',
            'check' => 'prestashop-live-store-smoke',
            'readOnly' => true,
            'prestashopVersion' => $prestaVersion,
            'connectorVersion' =>
                (string) $module->version,
            'endpointHttps' => true,
            'credentialConfigured' => true,
            'cargoReadCheck' => true,
            'orderMapping' => $orderSmoke,
        ),
        JSON_UNESCAPED_SLASHES
    ) . PHP_EOL
);
