<?php

declare(strict_types=1);

$fail = static function (string $message): void {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
};

$root = trim((string) getenv('PDECA_PRESTASHOP_ROOT'));
if ($root === '') {
    $root = '/var/www/html';
}
$root = rtrim($root, DIRECTORY_SEPARATOR);
$config = $root . '/config/config.inc.php';
$init = $root . '/init.php';
if (!is_file($config)) {
    $fail('PrestaShop bootstrap is unavailable');
}
require_once $config;
if (is_file($init)) {
    require_once $init;
}

$apiKey = trim((string) getenv('PDECA_ACCEPTANCE_API_KEY'));
if ($apiKey === '') {
    $fail('PDECA_ACCEPTANCE_API_KEY is required');
}

$shopId = (int) Db::getInstance()->getValue(
    'SELECT id_shop FROM `' . _DB_PREFIX_ . 'shop` WHERE active = 1 ORDER BY id_shop ASC'
);
if ($shopId <= 0) {
    $fail('Controlled PrestaShop fixture has no active shop');
}
Shop::setContext(Shop::CONTEXT_SHOP, $shopId);
$context = Context::getContext();
$context->shop = new Shop($shopId);
if (!Validate::isLoadedObject($context->shop)) {
    $fail('PrestaShop shop context could not be initialized');
}

$module = Module::getInstanceByName('puentedeca');
if (!$module || !is_object($module) || empty($module->active)) {
    $fail('Kairoseth Cargo module is not active');
}

Configuration::updateValue(PuenteDeca::CONFIG_ENDPOINT, 'https://kairoseth.com/api/deca', false, null, $shopId);
Configuration::updateValue(PuenteDeca::CONFIG_TIMEOUT, 15, false, null, $shopId);
Configuration::updateValue(PuenteDeca::CONFIG_SHIPPER_NAME, 'Kairoseth Cargo Acceptance Shipper SL', false, null, $shopId);
Configuration::updateValue(PuenteDeca::CONFIG_SHIPPER_TAX_ID, 'B00000001', false, null, $shopId);
Configuration::updateValue(PuenteDeca::CONFIG_SHIPPER_ADDRESS, 'Synthetic acceptance origin address', false, null, $shopId);
Configuration::updateValue(PuenteDeca::CONFIG_ORIGIN, 'Barcelona Acceptance Depot', false, null, $shopId);
Configuration::updateValue(PuenteDeca::CONFIG_CARRIER_NAME, 'Kairoseth Cargo Acceptance Carrier SL', false, null, $shopId);
Configuration::updateValue(PuenteDeca::CONFIG_CARRIER_TAX_ID, 'B00000002', false, null, $shopId);

if (!PDECAPrestaShopSecretStore::set($apiKey, $shopId)) {
    $fail('Connector credential could not be encrypted');
}
if (PDECAPrestaShopSecretStore::get($shopId) !== $apiKey) {
    $fail('Connector credential encryption round-trip failed');
}

$orderId = (int) Db::getInstance()->getValue(
    'SELECT id_order FROM `' . _DB_PREFIX_ . 'orders` WHERE id_shop = ' . (int) $shopId . ' ORDER BY id_order ASC'
);
if ($orderId <= 0) {
    $fail('Controlled PrestaShop fixture has no synthetic seed order');
}
$order = new Order($orderId);
if (!Validate::isLoadedObject($order)) {
    $fail('Synthetic PrestaShop order could not be loaded');
}

$logistics = array(
    'transport_date' => gmdate('Y-m-d'),
    'tractor_registration' => '0000QAQ',
    'trailer_registration' => 'R0000QAQ',
    'carrier_name' => 'Kairoseth Cargo Acceptance Carrier SL',
    'carrier_tax_id' => 'B00000002',
    'weight_kg' => '100',
    'special_authorization' => '',
);
if (!$module->saveLogistics($orderId, $logistics)) {
    $fail('Synthetic PrestaShop logistics could not be retained');
}

$payload = PDECAPrestaShopOrderPayload::build($order, $module->settings(), $module->getSyncRow($orderId) ?: array());
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

fwrite(STDOUT, (string) $orderId . PHP_EOL);
