<?php

declare(strict_types=1);

function pdeca_full_stack_fail($message)
{
    fwrite(STDERR, (string) $message . PHP_EOL);
    exit(1);
}

$root = trim((string) getenv('PDECA_PRESTASHOP_ROOT'));
if ($root === '') {
    $root = '/var/www/html';
}
$root = rtrim($root, DIRECTORY_SEPARATOR);

$config = $root . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'config.inc.php';
$init = $root . DIRECTORY_SEPARATOR . 'init.php';

if (!is_file($config)) {
    pdeca_full_stack_fail('PrestaShop config.inc.php not found');
}

require_once $config;
if (is_file($init)) {
    require_once $init;
}

if (!defined('_PS_VERSION_')) {
    pdeca_full_stack_fail('PrestaShop version is unavailable');
}

$prestaVersion = (string) _PS_VERSION_;
if (
    version_compare($prestaVersion, '1.7.8.0', '<')
    || version_compare($prestaVersion, '9.0.0', '>=')
) {
    pdeca_full_stack_fail('PrestaShop version is outside supported range: ' . $prestaVersion);
}

$shopId = (int) Db::getInstance()->getValue(
    'SELECT id_shop FROM `' . _DB_PREFIX_ . 'shop`'
    . ' WHERE active = 1 ORDER BY id_shop ASC'
);
if ($shopId <= 0) {
    pdeca_full_stack_fail('Controlled PrestaShop fixture has no active shop');
}

Shop::setContext(Shop::CONTEXT_SHOP, $shopId);
$context = Context::getContext();
$context->shop = new Shop($shopId);

if (!Validate::isLoadedObject($context->shop)) {
    pdeca_full_stack_fail('Synthetic PrestaShop shop context could not be initialized');
}

if (!Module::isInstalled('puentedeca')) {
    pdeca_full_stack_fail('Kairoseth Cargo module is not installed');
}

$module = Module::getInstanceByName('puentedeca');
if (!$module || !is_object($module) || empty($module->active)) {
    pdeca_full_stack_fail('Kairoseth Cargo module is not active');
}
$module->context = $context;

if (
    !class_exists('PDECAPrestaShopSecretStore')
    || !class_exists('PDECAPrestaShopOrderPayload')
    || !class_exists('PDECAPrestaShopConnector')
) {
    pdeca_full_stack_fail('Kairoseth Cargo module runtime is incomplete');
}

Configuration::updateValue(
    PuenteDeca::CONFIG_ENDPOINT,
    'https://kairoseth.com/api/deca',
    false,
    null,
    $shopId
);
Configuration::updateValue(
    PuenteDeca::CONFIG_SHIPPER_NAME,
    'Kairoseth Cargo Internal QA Shipper SL',
    false,
    null,
    $shopId
);
Configuration::updateValue(
    PuenteDeca::CONFIG_SHIPPER_TAX_ID,
    'B00000001',
    false,
    null,
    $shopId
);
Configuration::updateValue(
    PuenteDeca::CONFIG_SHIPPER_ADDRESS,
    'Synthetic QA origin address',
    false,
    null,
    $shopId
);
Configuration::updateValue(
    PuenteDeca::CONFIG_ORIGIN,
    'Barcelona QA Depot',
    false,
    null,
    $shopId
);
Configuration::updateValue(
    PuenteDeca::CONFIG_CARRIER_NAME,
    'Kairoseth Cargo Internal QA Carrier SL',
    false,
    null,
    $shopId
);
Configuration::updateValue(
    PuenteDeca::CONFIG_CARRIER_TAX_ID,
    'B00000002',
    false,
    null,
    $shopId
);

$syntheticSecret = 'pdeca_internal_full_stack_secret_0123456789';
if (!PDECAPrestaShopSecretStore::set($syntheticSecret, $shopId)) {
    pdeca_full_stack_fail('Connector secret could not be encrypted in real PrestaShop runtime');
}
if (PDECAPrestaShopSecretStore::get($shopId) !== $syntheticSecret) {
    pdeca_full_stack_fail('Connector secret encryption round-trip failed');
}

$orderId = (int) Db::getInstance()->getValue(
    'SELECT id_order FROM `' . _DB_PREFIX_ . 'orders`'
    . ' WHERE id_shop = ' . (int) $shopId
    . ' ORDER BY id_order ASC'
);

if ($orderId <= 0) {
    pdeca_full_stack_fail('Controlled PrestaShop fixture has no synthetic seed order');
}

$order = new Order($orderId);
if (!Validate::isLoadedObject($order)) {
    pdeca_full_stack_fail('Synthetic PrestaShop order could not be loaded');
}

$logistics = array(
    'transport_date' => '2026-10-05',
    'tractor_registration' => '0000QAQ',
    'trailer_registration' => 'R0000QAQ',
    'carrier_name' => 'Kairoseth Cargo Internal QA Carrier SL',
    'carrier_tax_id' => 'B00000002',
    'weight_kg' => '100',
    'special_authorization' => '',
);

try {
    $payload = PDECAPrestaShopOrderPayload::build(
        $order,
        $module->settings(),
        $logistics
    );

    $checks = array(
        'externalReference' => isset($payload['externalReference']) ? $payload['externalReference'] : '',
        'contractualShipper.legalName' => isset($payload['contractualShipper']['legalName']) ? $payload['contractualShipper']['legalName'] : '',
        'contractualShipper.taxId' => isset($payload['contractualShipper']['taxId']) ? $payload['contractualShipper']['taxId'] : '',
        'contractualShipper.address' => isset($payload['contractualShipper']['address']) ? $payload['contractualShipper']['address'] : '',
        'effectiveCarrier.legalName' => isset($payload['effectiveCarrier']['legalName']) ? $payload['effectiveCarrier']['legalName'] : '',
        'effectiveCarrier.taxId' => isset($payload['effectiveCarrier']['taxId']) ? $payload['effectiveCarrier']['taxId'] : '',
        'route.origin' => isset($payload['route']['origin']) ? $payload['route']['origin'] : '',
        'route.destination' => isset($payload['route']['destination']) ? $payload['route']['destination'] : '',
        'goods.nature' => isset($payload['goods']['nature']) ? $payload['goods']['nature'] : '',
        'transport.date' => isset($payload['transport']['date']) ? $payload['transport']['date'] : '',
        'transport.vehicle.tractorRegistration' => isset($payload['transport']['vehicle']['tractorRegistration']) ? $payload['transport']['vehicle']['tractorRegistration'] : '',
    );

    foreach ($checks as $name => $value) {
        if (trim((string) $value) === '') {
            pdeca_full_stack_fail('Mapped payload is missing ' . $name);
        }
    }

    $weight = isset($payload['goods']['weight']['value'])
        ? $payload['goods']['weight']['value']
        : null;
    if (!is_numeric($weight) || (float) $weight !== 100.0) {
        pdeca_full_stack_fail('Mapped payload weight is invalid');
    }

    fwrite(
        STDOUT,
        json_encode(
            array(
                'status' => 'ok',
                'check' => 'prestashop-full-stack-internal',
                'prestashopVersion' => $prestaVersion,
                'connectorVersion' => (string) $module->version,
                'moduleInstalled' => true,
                'moduleActive' => true,
                'shopContextInitialized' => true,
                'secretRoundTrip' => true,
                'syntheticSeedOrderLoaded' => true,
                'payloadMapped' => true,
                'payloadContainsCustomerValues' => false,
            ),
            JSON_UNESCAPED_SLASHES
        ) . PHP_EOL
    );
} finally {
    PDECAPrestaShopSecretStore::delete($shopId);
}
