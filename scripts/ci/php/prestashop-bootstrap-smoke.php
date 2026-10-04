<?php

declare(strict_types=1);

$targetVersion = isset($argv[1]) ? (string) $argv[1] : '1.7.8.0';

define('_PS_VERSION_', $targetVersion);
define('_COOKIE_KEY_', 'pdeca-prestashop-cookie-key-0123456789');
define('_COOKIE_IV_', 'pdeca-prestashop-cookie-iv');
define('_MYSQL_ENGINE_', 'InnoDB');
define('_DB_PREFIX_', 'ps_');

function pdeca_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

class StubShop
{
    public $id = 1;

    public function getBaseURL($ssl = false)
    {
        return $ssl
            ? 'https://prestashop.example.test/'
            : 'http://prestashop.example.test/';
    }
}

class StubLink
{
    public function getAdminLink()
    {
        return '/admin/index.php';
    }
}

class StubLanguage
{
    public $id = 1;
}

class StubContext
{
    public $shop;
    public $link;
    public $language;

    public function __construct()
    {
        $this->shop = new StubShop();
        $this->link = new StubLink();
        $this->language = new StubLanguage();
    }
}

class Module
{
    public $name = '';
    public $tab = '';
    public $version = '';
    public $author = '';
    public $need_instance = 0;
    public $bootstrap = false;
    public $ps_versions_compliancy = array();
    public $displayName = '';
    public $description = '';
    public $confirmUninstall = '';
    public $context;
    public $registeredHooks = array();

    public function __construct()
    {
        $this->context = new StubContext();
    }

    public function l($text)
    {
        return (string) $text;
    }

    public function install()
    {
        return true;
    }

    public function uninstall()
    {
        return true;
    }

    public function registerHook($hook)
    {
        $this->registeredHooks[] = (string) $hook;
        return true;
    }
}

class Configuration
{
    private static $values = array(
        'PS_WEIGHT_UNIT:global' => 'kg',
    );

    private static function storageKey($key, $shopId)
    {
        return (string) $key . ':' . ($shopId === null ? 'global' : (int) $shopId);
    }

    public static function updateValue($key, $value, $html = false, $groupId = null, $shopId = null)
    {
        self::$values[self::storageKey($key, $shopId)] = $value;
        return true;
    }

    public static function get($key, $groupId = null, $groupId2 = null, $shopId = null)
    {
        $specific = self::storageKey($key, $shopId);
        if (array_key_exists($specific, self::$values)) {
            return self::$values[$specific];
        }

        $global = self::storageKey($key, null);
        return array_key_exists($global, self::$values)
            ? self::$values[$global]
            : '';
    }
}

class Db
{
    private static $instance;
    public $queries = array();

    public static function getInstance()
    {
        if (!self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function execute($sql)
    {
        $this->queries[] = (string) $sql;
        return true;
    }

    public function getRow()
    {
        return false;
    }
}

class Validate
{
    public static function isLoadedObject($object)
    {
        return is_object($object);
    }
}

class Address
{
    public $address1 = 'Avinguda Industrial 10';
    public $address2 = '';
    public $postcode = '08755';
    public $city = 'Castellbisbal';
    public $id_state = 8;
    public $id_country = 6;

    public function __construct($id)
    {
    }
}

class State
{
    public static function getNameById($id)
    {
        return 'Barcelona';
    }
}

class Country
{
    public static function getIsoById($id)
    {
        return 'ES';
    }
}

class Order
{
    public $id;
    public $id_shop;
    public $id_address_delivery = 10;
    public $id_address_invoice = 11;
    private $products;

    public function __construct($id = 42, array $products = null)
    {
        $this->id = (int) $id;
        $this->id_shop = 1;
        $this->products = $products === null
            ? array(
                array(
                    'product_name' => 'Mesa',
                    'product_weight' => 2,
                    'product_quantity' => 2,
                ),
                array(
                    'product_name' => 'Silla',
                    'product_weight' => 1,
                    'product_quantity' => 1,
                ),
            )
            : $products;
    }

    public function getProducts()
    {
        return $this->products;
    }
}

$moduleOverride = getenv('PDECA_PS_MODULE_FILE');
$moduleFile = is_string($moduleOverride) && trim($moduleOverride) !== ''
    ? $moduleOverride
    : dirname(__DIR__, 3)
        . '/connectors/prestashop/puentedeca.php';

pdeca_assert(is_file($moduleFile), 'PrestaShop module entrypoint was not found.');
require $moduleFile;

pdeca_assert(class_exists('PuenteDeca'), 'PrestaShop module class did not load.');

$module = new PuenteDeca();

pdeca_assert($module->name === 'puentedeca', 'PrestaShop module name drifted.');
pdeca_assert($module->version === '0.1.0', 'PrestaShop module version drifted.');
pdeca_assert(
    version_compare($targetVersion, $module->ps_versions_compliancy['min'], '>='),
    'Target PrestaShop version is below the declared minimum.'
);
pdeca_assert(
    version_compare($targetVersion, $module->ps_versions_compliancy['max'], '<='),
    'Target PrestaShop version is above the declared maximum.'
);

pdeca_assert($module->install(), 'PrestaShop module install lifecycle failed.');
pdeca_assert(
    Configuration::get(PuenteDeca::CONFIG_ENDPOINT, null, null, 1)
        === 'https://kairoseth.com/api/deca',
    'PrestaShop default Cargo endpoint drifted.'
);
pdeca_assert(
    (int) Configuration::get(PuenteDeca::CONFIG_TIMEOUT, null, null, 1) === 15,
    'PrestaShop default request timeout drifted.'
);
pdeca_assert(
    Configuration::get(PuenteDeca::CONFIG_AUTO_STATES, null, null, 1) === '',
    'PrestaShop automation must remain opt-in by default.'
);
pdeca_assert(
    in_array('displayAdminOrderMainBottom', $module->registeredHooks, true),
    'PrestaShop admin order hook was not registered.'
);
pdeca_assert(
    in_array('actionOrderStatusPostUpdate', $module->registeredHooks, true),
    'PrestaShop order-status hook was not registered.'
);

$queries = Db::getInstance()->queries;
pdeca_assert(
    count($queries) >= 1
        && strpos($queries[0], 'pdeca_order_sync') !== false
        && strpos($queries[0], 'utf8mb4') !== false,
    'PrestaShop connector schema bootstrap failed.'
);

pdeca_assert(
    PDECAPrestaShopSecretStore::set('prestashop-smoke-secret', 1),
    'PrestaShop encrypted secret save failed.'
);
$storedSecret = Configuration::get(PDECAPrestaShopSecretStore::CONFIG_KEY, null, null, 1);
pdeca_assert(
    $storedSecret !== ''
        && strpos((string) $storedSecret, 'prestashop-smoke-secret') === false,
    'PrestaShop connector secret must not be stored in plaintext.'
);
pdeca_assert(
    PDECAPrestaShopSecretStore::get(1) === 'prestashop-smoke-secret',
    'PrestaShop encrypted secret roundtrip failed.'
);

$settings = array_merge(
    $module->settings(),
    array(
        'shipper_name' => 'Shipper SL',
        'shipper_tax_id' => 'B12345678',
        'shipper_address' => 'Barcelona',
        'origin' => 'Barcelona',
        'carrier_name' => 'Carrier SL',
        'carrier_tax_id' => 'B87654321',
    )
);

$client = new PDECAPrestaShopClient(
    array_merge(
        $settings,
        array('module_version' => PuenteDeca::VERSION)
    )
);
pdeca_assert($client->configured(), 'PrestaShop client did not become configured.');

$order = new Order(42);
$payload = PDECAPrestaShopOrderPayload::build(
    $order,
    $settings,
    array(
        'transport_date' => '2026-10-05',
        'tractor_registration' => '1234ABC',
        'trailer_registration' => '',
        'carrier_name' => '',
        'carrier_tax_id' => '',
        'weight_kg' => '',
        'special_authorization' => '',
    )
);

pdeca_assert(
    $payload['externalReference'] === 'prestashop:1:order:42',
    'PrestaShop external reference drifted.'
);
pdeca_assert(
    $payload['goods']['weight']['value'] === 5.0,
    'PrestaShop weight mapping failed.'
);
pdeca_assert(
    $payload['goods']['weight']['unit'] === 'kg',
    'PrestaShop weight unit must be kg.'
);
pdeca_assert(
    $payload['route']['destination']
        === 'Avinguda Industrial 10, 08755, Castellbisbal, Barcelona, ES',
    'PrestaShop destination mapping failed.'
);
pdeca_assert(
    $payload['transport']['date'] === '2026-10-05'
        && $payload['transport']['vehicle']['tractorRegistration'] === '1234ABC',
    'PrestaShop explicit logistics mapping failed.'
);
pdeca_assert(
    $payload['transport']['vehicle']['trailerRegistration'] === null,
    'PrestaShop optional trailer must remain null when absent.'
);

pdeca_assert($module->uninstall(), 'PrestaShop module uninstall lifecycle failed.');

$dropSeen = false;
foreach (Db::getInstance()->queries as $sql) {
    if (strpos($sql, 'DROP TABLE IF EXISTS') !== false) {
        $dropSeen = true;
        break;
    }
}
pdeca_assert($dropSeen, 'PrestaShop uninstall did not remove the local sync table.');

fwrite(
    STDOUT,
    json_encode(
        array(
            'status' => 'ok',
            'check' => 'prestashop-bootstrap-smoke',
            'targetVersion' => $targetVersion,
            'installLifecycle' => true,
            'hooks' => $module->registeredHooks,
            'encryptedSecretRoundtrip' => true,
            'payloadMapping' => true,
            'uninstallLifecycle' => true,
        ),
        JSON_UNESCAPED_SLASHES
    ) . PHP_EOL
);
