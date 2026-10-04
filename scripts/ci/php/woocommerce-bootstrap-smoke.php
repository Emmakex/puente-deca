<?php

declare(strict_types=1);

define('ABSPATH', __DIR__);
define('PDECA_SMOKE_WP_VERSION', '6.5.0');
define('PDECA_SMOKE_WC_VERSION', '8.2.0');

$GLOBALS['pdeca_actions'] = array();
$GLOBALS['pdeca_filters'] = array();
$GLOBALS['pdeca_options'] = array();
$GLOBALS['pdeca_remote_requests'] = array();
$GLOBALS['pdeca_deactivation_hooks'] = array();

function pdeca_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function add_action($hook, $callback, $priority = 10, $acceptedArgs = 1)
{
    $GLOBALS['pdeca_actions'][$hook][] = array(
        'callback' => $callback,
        'priority' => (int) $priority,
        'accepted_args' => (int) $acceptedArgs,
    );
    return true;
}

function add_filter($hook, $callback, $priority = 10, $acceptedArgs = 1)
{
    $GLOBALS['pdeca_filters'][$hook][] = array(
        'callback' => $callback,
        'priority' => (int) $priority,
        'accepted_args' => (int) $acceptedArgs,
    );
    return true;
}

function pdeca_run_action($hook)
{
    $callbacks = isset($GLOBALS['pdeca_actions'][$hook])
        ? $GLOBALS['pdeca_actions'][$hook]
        : array();

    usort(
        $callbacks,
        static function ($left, $right) {
            return $left['priority'] <=> $right['priority'];
        }
    );

    foreach ($callbacks as $entry) {
        call_user_func($entry['callback']);
    }
}

function apply_filters($hook, $value)
{
    if (empty($GLOBALS['pdeca_filters'][$hook])) {
        return $value;
    }

    foreach ($GLOBALS['pdeca_filters'][$hook] as $entry) {
        $value = call_user_func($entry['callback'], $value);
    }

    return $value;
}

function load_plugin_textdomain()
{
    return true;
}

function plugin_dir_path($file)
{
    return rtrim(dirname($file), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
}

function plugin_basename($file)
{
    return basename(dirname($file)) . '/' . basename($file);
}

function register_deactivation_hook($file, $callback)
{
    $GLOBALS['pdeca_deactivation_hooks'][] = array($file, $callback);
}

function wp_clear_scheduled_hook()
{
    return 0;
}

function wp_salt($scheme = 'auth')
{
    return 'pdeca-smoke-' . (string) $scheme . '-0123456789abcdef';
}

function update_option($name, $value)
{
    $GLOBALS['pdeca_options'][$name] = $value;
    return true;
}

function delete_option($name)
{
    unset($GLOBALS['pdeca_options'][$name]);
    return true;
}

function get_option($name, $default = false)
{
    return array_key_exists($name, $GLOBALS['pdeca_options'])
        ? $GLOBALS['pdeca_options'][$name]
        : $default;
}

function wp_parse_args($args, $defaults = array())
{
    return array_merge($defaults, is_array($args) ? $args : array());
}

function untrailingslashit($value)
{
    return rtrim((string) $value, '/');
}

function __($text)
{
    return (string) $text;
}

function sanitize_text_field($value)
{
    return trim(strip_tags((string) $value));
}

function sanitize_key($value)
{
    return strtolower(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $value));
}

function wp_json_encode($value, $flags = 0)
{
    return json_encode($value, $flags);
}

function home_url($path = '/')
{
    return 'https://shop.example.test' . $path;
}

function get_current_blog_id()
{
    return 7;
}

function wc_get_weight($value, $unit)
{
    pdeca_assert($unit === 'kg', 'WooCommerce payload must normalize weight to kg.');
    return (float) $value;
}

function is_wp_error($value)
{
    return $value instanceof WP_Error;
}

function wp_remote_request($url, $args)
{
    $GLOBALS['pdeca_remote_requests'][] = array(
        'url' => $url,
        'args' => $args,
    );

    return array(
        'response' => array('code' => 200),
        'body' => json_encode(
            array(
                'items' => array(),
                'total' => 0,
            )
        ),
    );
}

function wp_remote_retrieve_response_code($response)
{
    return (int) $response['response']['code'];
}

function wp_remote_retrieve_body($response)
{
    return (string) $response['body'];
}

class WP_Error
{
    private $code;
    private $message;

    public function __construct($code, $message = '')
    {
        $this->code = (string) $code;
        $this->message = (string) $message;
    }

    public function get_error_code()
    {
        return $this->code;
    }

    public function get_error_message()
    {
        return $this->message;
    }
}

class WooCommerce
{
}

class WC_Product
{
    private $weight;

    public function __construct($weight)
    {
        $this->weight = $weight;
    }

    public function get_weight()
    {
        return $this->weight;
    }
}

class WC_Order_Item_Product
{
    private $name;
    private $product;
    private $quantity;

    public function __construct($name, WC_Product $product, $quantity)
    {
        $this->name = $name;
        $this->product = $product;
        $this->quantity = $quantity;
    }

    public function get_name()
    {
        return $this->name;
    }

    public function get_product()
    {
        return $this->product;
    }

    public function get_quantity()
    {
        return $this->quantity;
    }
}

class WC_Order
{
    private $id;
    private $meta;
    private $items;

    public function __construct($id, array $meta, array $items)
    {
        $this->id = (int) $id;
        $this->meta = $meta;
        $this->items = $items;
    }

    public function get_id()
    {
        return $this->id;
    }

    public function get_meta($key)
    {
        return isset($this->meta[$key]) ? $this->meta[$key] : '';
    }

    public function get_items($type = 'line_item')
    {
        return $this->items;
    }

    public function get_shipping_address_1()
    {
        return 'Carrer Major 1';
    }

    public function get_shipping_address_2()
    {
        return '';
    }

    public function get_shipping_postcode()
    {
        return '08755';
    }

    public function get_shipping_city()
    {
        return 'Castellbisbal';
    }

    public function get_shipping_state()
    {
        return 'Barcelona';
    }

    public function get_shipping_country()
    {
        return 'ES';
    }

    public function get_billing_address_1()
    {
        return '';
    }

    public function get_billing_address_2()
    {
        return '';
    }

    public function get_billing_postcode()
    {
        return '';
    }

    public function get_billing_city()
    {
        return '';
    }

    public function get_billing_state()
    {
        return '';
    }

    public function get_billing_country()
    {
        return '';
    }

    public function get_customer_note()
    {
        return 'Entrega por muelle 2';
    }
}

eval(
    'namespace Automattic\\WooCommerce\\Utilities {' .
    'class FeaturesUtil {' .
    'public static $calls = array();' .
    'public static function declare_compatibility($feature, $file, $compatible) {' .
    'self::$calls[] = array($feature, $file, $compatible);' .
    '}' .
    '}' .
    '}'
);

$pluginOverride = getenv('PDECA_WOO_PLUGIN_FILE');
$plugin = is_string($pluginOverride) && trim($pluginOverride) !== ''
    ? $pluginOverride
    : dirname(__DIR__, 3)
        . '/connectors/woocommerce/puente-deca-woocommerce.php';

pdeca_assert(is_file($plugin), 'WooCommerce plugin entrypoint was not found.');
require $plugin;

pdeca_assert(
    defined('PDECA_WOO_VERSION') && PDECA_WOO_VERSION === '0.1.0',
    'WooCommerce connector version bootstrap failed.'
);
pdeca_assert(
    count($GLOBALS['pdeca_deactivation_hooks']) === 1,
    'WooCommerce connector must register one deactivation cleanup hook.'
);

pdeca_run_action('before_woocommerce_init');

$calls = \Automattic\WooCommerce\Utilities\FeaturesUtil::$calls;
pdeca_assert(count($calls) === 1, 'WooCommerce HPOS compatibility was not declared.');
pdeca_assert($calls[0][0] === 'custom_order_tables', 'WooCommerce HPOS feature name drifted.');
pdeca_assert($calls[0][2] === true, 'WooCommerce HPOS compatibility must stay enabled.');

pdeca_run_action('plugins_loaded');

foreach (
    array(
        'PDECA_Woo_Secret_Store',
        'PDECA_Woo_Settings',
        'PDECA_Woo_Client',
        'PDECA_Woo_Order_Payload',
        'PDECA_Woo_Connector',
    ) as $class
) {
    pdeca_assert(class_exists($class), $class . ' did not load.');
}

foreach (
    array(
        'admin_menu',
        'admin_post_pdeca_woo_save_settings',
        'admin_post_pdeca_woo_test_connection',
        'pdeca_woo_process_order',
        'woocommerce_order_status_changed',
        'woocommerce_order_action_pdeca_generate',
    ) as $hook
) {
    pdeca_assert(
        !empty($GLOBALS['pdeca_actions'][$hook]),
        'WooCommerce bootstrap did not register hook ' . $hook
    );
}

pdeca_assert(
    !empty($GLOBALS['pdeca_filters']['woocommerce_order_actions']),
    'WooCommerce order action filter was not registered.'
);

$defaults = PDECA_Woo_Settings::get();
pdeca_assert(
    $defaults['endpoint'] === 'https://kairoseth.com/api/deca',
    'WooCommerce default endpoint drifted.'
);
pdeca_assert(
    $defaults['auto_statuses'] === array(),
    'WooCommerce automation must remain opt-in by default.'
);

pdeca_assert(
    PDECA_Woo_Secret_Store::save('woo-smoke-secret'),
    'WooCommerce encrypted secret save failed.'
);
$storedSecret = get_option(PDECA_Woo_Secret_Store::OPTION, '');
pdeca_assert(
    $storedSecret !== '' && strpos($storedSecret, 'woo-smoke-secret') === false,
    'WooCommerce connector secret must not be stored in plaintext.'
);
pdeca_assert(
    PDECA_Woo_Secret_Store::get() === 'woo-smoke-secret',
    'WooCommerce encrypted secret roundtrip failed.'
);

$client = new PDECA_Woo_Client($defaults);
pdeca_assert($client->configured(), 'WooCommerce client did not become configured.');
$connection = $client->test_connection();
pdeca_assert(
    is_array($connection) && $connection['total'] === 0,
    'WooCommerce non-destructive connection check failed.'
);

$request = end($GLOBALS['pdeca_remote_requests']);
pdeca_assert(
    $request['url'] === 'https://kairoseth.com/api/deca/v1/shipments?limit=1',
    'WooCommerce connection check URL drifted.'
);
pdeca_assert($request['args']['method'] === 'GET', 'WooCommerce connection check must use GET.');
pdeca_assert($request['args']['redirection'] === 0, 'WooCommerce API requests must not follow redirects.');
pdeca_assert(
    $request['args']['headers']['Authorization'] === 'Bearer woo-smoke-secret',
    'WooCommerce connector credential was not sent as the expected Bearer token.'
);

$settings = array_merge(
    $defaults,
    array(
        'shipper_name' => 'Shipper SL',
        'shipper_tax_id' => 'B12345678',
        'shipper_address' => 'Barcelona',
        'origin' => 'Barcelona',
        'carrier_name' => 'Carrier SL',
        'carrier_tax_id' => 'B87654321',
    )
);
$order = new WC_Order(
    42,
    array(
        '_pdeca_transport_date' => '2026-10-05',
        '_pdeca_tractor_registration' => '1234ABC',
    ),
    array(
        new WC_Order_Item_Product('Mesa', new WC_Product('2'), 2),
        new WC_Order_Item_Product('Silla', new WC_Product('1'), 1),
    )
);

$payload = PDECA_Woo_Order_Payload::build($order, $settings);
pdeca_assert($payload['externalReference'] === 'woo:7:order:42', 'WooCommerce external reference drifted.');
pdeca_assert($payload['goods']['weight']['value'] === 5.0, 'WooCommerce weight mapping failed.');
pdeca_assert($payload['goods']['weight']['unit'] === 'kg', 'WooCommerce weight unit must be kg.');
pdeca_assert($payload['transport']['date'] === '2026-10-05', 'WooCommerce transport date mapping failed.');
pdeca_assert(
    $payload['transport']['vehicle']['tractorRegistration'] === '1234ABC',
    'WooCommerce tractor registration mapping failed.'
);

$orderActions = PDECA_Woo_Connector::instance()->order_actions(array());
pdeca_assert(isset($orderActions['pdeca_generate']), 'WooCommerce manual DeCA order action is missing.');

PDECA_Woo_Secret_Store::save('');

fwrite(
    STDOUT,
    json_encode(
        array(
            'status' => 'ok',
            'check' => 'woocommerce-bootstrap-smoke',
            'wordpressBaseline' => PDECA_SMOKE_WP_VERSION,
            'woocommerceBaseline' => PDECA_SMOKE_WC_VERSION,
            'hpos' => true,
            'encryptedSecretRoundtrip' => true,
            'connectionCheck' => 'GET /v1/shipments?limit=1',
            'payloadMapping' => true,
        ),
        JSON_UNESCAPED_SLASHES
    ) . PHP_EOL
);
