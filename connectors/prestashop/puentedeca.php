<?php

if (!defined('_PS_VERSION_')) {
    exit;
}

require_once __DIR__ . '/classes/PDECAPrestaShopSecretStore.php';
require_once __DIR__ . '/classes/PDECAPrestaShopClient.php';
require_once __DIR__ . '/classes/PDECAPrestaShopOrderPayload.php';
require_once __DIR__ . '/classes/PDECAPrestaShopConnector.php';

class PuenteDeca extends Module
{
    const VERSION = '0.1.0';
    const CONFIG_ENDPOINT = 'PDECA_PS_ENDPOINT';
    const CONFIG_TIMEOUT = 'PDECA_PS_TIMEOUT';
    const CONFIG_SHIPPER_NAME = 'PDECA_PS_SHIPPER_NAME';
    const CONFIG_SHIPPER_TAX_ID = 'PDECA_PS_SHIPPER_TAX_ID';
    const CONFIG_SHIPPER_ADDRESS = 'PDECA_PS_SHIPPER_ADDRESS';
    const CONFIG_ORIGIN = 'PDECA_PS_ORIGIN';
    const CONFIG_CARRIER_NAME = 'PDECA_PS_CARRIER_NAME';
    const CONFIG_CARRIER_TAX_ID = 'PDECA_PS_CARRIER_TAX_ID';
    const CONFIG_AUTO_STATES = 'PDECA_PS_AUTO_STATES';

    public function __construct()
    {
        $this->name = 'puentedeca';
        $this->tab = 'shipping_logistics';
        $this->version = self::VERSION;
        $this->author = 'Kairoseth Extensions';
        $this->need_instance = 0;
        $this->bootstrap = true;
        $this->ps_versions_compliancy = array(
            'min' => '1.7.8.0',
            'max' => '8.99.99',
        );

        parent::__construct();

        $this->displayName = $this->l('Kairoseth Cargo · DeCA');
        $this->description = $this->l('Connects PrestaShop with Kairoseth Cargo to create and keep DeCA transport documents up to date.');
        $this->confirmUninstall = $this->l('Uninstall Kairoseth Cargo · DeCA? Local connector state will be removed, but remote DeCA documents are not deleted.');
    }

    public function install()
    {
        $shopId = (int) $this->context->shop->id;

        return parent::install()
            && $this->installSchema()
            && Configuration::updateValue(self::CONFIG_ENDPOINT, 'https://kairoseth.com/api/deca', false, null, $shopId)
            && Configuration::updateValue(self::CONFIG_TIMEOUT, 15, false, null, $shopId)
            && Configuration::updateValue(self::CONFIG_AUTO_STATES, '', false, null, $shopId)
            && $this->registerHook('displayAdminOrderMainBottom')
            && $this->registerHook('actionOrderStatusPostUpdate');
    }

    public function uninstall()
    {
        $shopId = (int) $this->context->shop->id;
        foreach (
            array(
                self::CONFIG_ENDPOINT,
                self::CONFIG_TIMEOUT,
                self::CONFIG_SHIPPER_NAME,
                self::CONFIG_SHIPPER_TAX_ID,
                self::CONFIG_SHIPPER_ADDRESS,
                self::CONFIG_ORIGIN,
                self::CONFIG_CARRIER_NAME,
                self::CONFIG_CARRIER_TAX_ID,
                self::CONFIG_AUTO_STATES,
            ) as $key
        ) {
            Configuration::updateValue($key, '', false, null, $shopId);
        }
        PDECAPrestaShopSecretStore::delete($shopId);

        return $this->uninstallSchema() && parent::uninstall();
    }

    public function getContent()
    {
        $output = '';

        if (Tools::isSubmit('submitPuenteDecaSettings')) {
            $output .= $this->saveSettings();
        }
        if (Tools::isSubmit('submitPuenteDecaProcess')) {
            $output .= $this->processManualOrder();
        }

        return $output . $this->renderSettingsForm() . $this->renderManualOrderPanel();
    }

    public function hookActionOrderStatusPostUpdate($params)
    {
        $newStatus = isset($params['newOrderStatus']) ? $params['newOrderStatus'] : null;
        $orderId = isset($params['id_order']) ? (int) $params['id_order'] : 0;

        if (
            $orderId <= 0
            || !is_object($newStatus)
            || !isset($newStatus->id)
            || !in_array((int) $newStatus->id, $this->automaticStateIds(), true)
        ) {
            return;
        }

        $order = new Order($orderId);
        if (
            !Validate::isLoadedObject($order)
            || (int) $order->id_shop !== (int) $this->context->shop->id
        ) {
            return;
        }

        PDECAPrestaShopConnector::processOrder($this, $order);
    }

    public function hookDisplayAdminOrderMainBottom($params)
    {
        $orderId = isset($params['id_order']) ? (int) $params['id_order'] : 0;
        if ($orderId <= 0) {
            return '';
        }

        $order = new Order($orderId);
        if (
            !Validate::isLoadedObject($order)
            || (int) $order->id_shop !== (int) $this->context->shop->id
        ) {
            return '';
        }

        $row = $this->getSyncRow($orderId);
        $status = is_array($row) ? (string) $row['status'] : 'not_configured';
        $documentId = is_array($row) ? (string) $row['document_id'] : '';
        $lastError = is_array($row) ? (string) $row['last_error'] : '';

        $url = $this->context->link->getAdminLink(
            'AdminModules',
            true,
            array(),
            array(
                'configure' => $this->name,
                'tab_module' => $this->tab,
                'module_name' => $this->name,
                'PDECA_ORDER_ID' => $orderId,
            )
        );

        $html = '<div class="card mt-2"><h3 class="card-header"><i class="material-icons">local_shipping</i> '
            . $this->l('Kairoseth Cargo · DeCA') . '</h3><div class="card-body">'
            . '<p><strong>' . $this->l('Status:') . '</strong> ' . Tools::safeOutput($status) . '</p>';

        if ($documentId !== '') {
            $html .= '<p><strong>' . $this->l('Current DeCA:') . '</strong> ' . Tools::safeOutput($documentId) . '</p>';
        }
        if ($lastError !== '') {
            $html .= '<div class="alert alert-warning">' . Tools::safeOutput($lastError) . '</div>';
        }

        return $html . '<a class="btn btn-default" href="' . Tools::safeOutput($url) . '">'
            . $this->l('Open Kairoseth Cargo · DeCA controls') . '</a></div></div>';
    }

    private function saveSettings()
    {
        $shopId = (int) $this->context->shop->id;
        $endpoint = rtrim(trim((string) Tools::getValue(self::CONFIG_ENDPOINT)), '/');
        $timeout = max(5, min(30, (int) Tools::getValue(self::CONFIG_TIMEOUT, 15)));
        $token = trim((string) Tools::getValue('PDECA_PS_API_KEY'));

        if ($endpoint === '' || strpos($endpoint, 'https://') !== 0) {
            return $this->displayError($this->l('The Puente DeCA endpoint must use HTTPS.'));
        }

        Configuration::updateValue(self::CONFIG_ENDPOINT, $endpoint, false, null, $shopId);
        Configuration::updateValue(self::CONFIG_TIMEOUT, $timeout, false, null, $shopId);

        foreach (
            array(
                self::CONFIG_SHIPPER_NAME,
                self::CONFIG_SHIPPER_TAX_ID,
                self::CONFIG_SHIPPER_ADDRESS,
                self::CONFIG_ORIGIN,
                self::CONFIG_CARRIER_NAME,
                self::CONFIG_CARRIER_TAX_ID,
                self::CONFIG_AUTO_STATES,
            ) as $key
        ) {
            Configuration::updateValue(
                $key,
                trim((string) Tools::getValue($key)),
                false,
                null,
                $shopId
            );
        }

        if ($token !== '' && !PDECAPrestaShopSecretStore::set($token, $shopId)) {
            return $this->displayError($this->l('The API key could not be encrypted on this server.'));
        }

        if ((int) Tools::getValue('PDECA_PS_CLEAR_API_KEY', 0) === 1) {
            PDECAPrestaShopSecretStore::delete($shopId);
        }

        return $this->displayConfirmation($this->l('Puente DeCA settings saved. The API key is stored encrypted and is never displayed again.'));
    }

    private function processManualOrder()
    {
        $orderId = (int) Tools::getValue('PDECA_ORDER_ID');
        $order = new Order($orderId);

        if (
            $orderId <= 0
            || !Validate::isLoadedObject($order)
            || (int) $order->id_shop !== (int) $this->context->shop->id
        ) {
            return $this->displayError($this->l('Invalid order.'));
        }

        $this->saveLogistics(
            $orderId,
            array(
                'transport_date' => trim((string) Tools::getValue('PDECA_TRANSPORT_DATE')),
                'tractor_registration' => trim((string) Tools::getValue('PDECA_TRACTOR_REGISTRATION')),
                'trailer_registration' => trim((string) Tools::getValue('PDECA_TRAILER_REGISTRATION')),
                'carrier_name' => trim((string) Tools::getValue('PDECA_CARRIER_NAME')),
                'carrier_tax_id' => trim((string) Tools::getValue('PDECA_CARRIER_TAX_ID')),
                'weight_kg' => trim((string) Tools::getValue('PDECA_WEIGHT_KG')),
                'special_authorization' => trim((string) Tools::getValue('PDECA_SPECIAL_AUTHORIZATION')),
            )
        );

        $result = PDECAPrestaShopConnector::processOrder($this, $order);
        if (!empty($result['ok'])) {
            return $this->displayConfirmation($this->l('Puente DeCA processed the order successfully.'));
        }

        return $this->displayError(
            isset($result['message'])
                ? Tools::safeOutput((string) $result['message'])
                : $this->l('Puente DeCA could not process the order.')
        );
    }

    private function renderSettingsForm()
    {
        $shopId = (int) $this->context->shop->id;
        $helper = new HelperForm();
        $helper->show_toolbar = false;
        $helper->table = $this->table;
        $helper->module = $this;
        $helper->default_form_language = (int) $this->context->language->id;
        $helper->identifier = $this->identifier;
        $helper->submit_action = 'submitPuenteDecaSettings';
        $helper->currentIndex = $this->context->link->getAdminLink('AdminModules', false)
            . '&configure=' . $this->name
            . '&tab_module=' . $this->tab
            . '&module_name=' . $this->name;
        $helper->token = Tools::getAdminTokenLite('AdminModules');

        $values = array();
        foreach (
            array(
                self::CONFIG_ENDPOINT,
                self::CONFIG_TIMEOUT,
                self::CONFIG_SHIPPER_NAME,
                self::CONFIG_SHIPPER_TAX_ID,
                self::CONFIG_SHIPPER_ADDRESS,
                self::CONFIG_ORIGIN,
                self::CONFIG_CARRIER_NAME,
                self::CONFIG_CARRIER_TAX_ID,
                self::CONFIG_AUTO_STATES,
            ) as $key
        ) {
            $values[$key] = Configuration::get($key, null, null, $shopId);
        }
        $values['PDECA_PS_API_KEY'] = '';
        $values['PDECA_PS_CLEAR_API_KEY'] = 0;
        $helper->tpl_vars = array('fields_value' => $values);

        $fields = array(
            array('type' => 'text', 'label' => $this->l('HTTPS endpoint'), 'name' => self::CONFIG_ENDPOINT, 'required' => true),
            array('type' => 'password', 'label' => $this->l('Connector API key'), 'name' => 'PDECA_PS_API_KEY', 'autocomplete' => false, 'desc' => $this->l('Leave blank to keep the existing encrypted key.')),
            array(
                'type' => 'switch',
                'label' => $this->l('Remove stored API key'),
                'name' => 'PDECA_PS_CLEAR_API_KEY',
                'is_bool' => true,
                'values' => array(
                    array('id' => 'pdeca_clear_on', 'value' => 1, 'label' => $this->l('Yes')),
                    array('id' => 'pdeca_clear_off', 'value' => 0, 'label' => $this->l('No')),
                ),
            ),
            array('type' => 'text', 'label' => $this->l('Contractual shipper legal name'), 'name' => self::CONFIG_SHIPPER_NAME, 'required' => true),
            array('type' => 'text', 'label' => $this->l('Contractual shipper tax ID'), 'name' => self::CONFIG_SHIPPER_TAX_ID, 'required' => true),
            array('type' => 'text', 'label' => $this->l('Contractual shipper address'), 'name' => self::CONFIG_SHIPPER_ADDRESS, 'required' => true),
            array('type' => 'text', 'label' => $this->l('Default loading origin'), 'name' => self::CONFIG_ORIGIN, 'required' => true),
            array('type' => 'text', 'label' => $this->l('Default effective carrier legal name'), 'name' => self::CONFIG_CARRIER_NAME),
            array('type' => 'text', 'label' => $this->l('Default effective carrier tax ID'), 'name' => self::CONFIG_CARRIER_TAX_ID),
            array('type' => 'text', 'label' => $this->l('Automatic order-state IDs'), 'name' => self::CONFIG_AUTO_STATES, 'desc' => $this->l('Comma-separated IDs. Leave blank for manual-only mode. Missing logistics data still blocks generation.')),
            array('type' => 'text', 'label' => $this->l('Request timeout (seconds)'), 'name' => self::CONFIG_TIMEOUT, 'required' => true),
        );

        return $helper->generateForm(
            array(
                array(
                    'form' => array(
                        'legend' => array('title' => $this->l('Kairoseth Cargo · DeCA connection'), 'icon' => 'icon-truck'),
                        'description' => $this->l('Connect this store to Kairoseth Cargo. DeCA validation, PDF, QR and document history remain centralized in Kairoseth.'),
                        'input' => $fields,
                        'submit' => array('title' => $this->l('Save'), 'class' => 'btn btn-default pull-right'),
                    ),
                ),
            )
        );
    }

    private function renderManualOrderPanel()
    {
        $orderId = (int) Tools::getValue('PDECA_ORDER_ID');
        if ($orderId <= 0) {
            return '<div class="panel"><h3>' . $this->l('Manual order processing')
                . '</h3><p>' . $this->l('Open an order and use the Puente DeCA card to load its logistics controls here.')
                . '</p></div>';
        }

        $order = new Order($orderId);
        if (
            !Validate::isLoadedObject($order)
            || (int) $order->id_shop !== (int) $this->context->shop->id
        ) {
            return $this->displayError($this->l('Invalid order.'));
        }

        $row = $this->getSyncRow($orderId);
        $value = function ($key) use ($row) {
            return is_array($row) && isset($row[$key]) ? (string) $row[$key] : '';
        };

        $action = $this->context->link->getAdminLink(
            'AdminModules',
            true,
            array(),
            array(
                'configure' => $this->name,
                'tab_module' => $this->tab,
                'module_name' => $this->name,
                'PDECA_ORDER_ID' => $orderId,
            )
        );

        $fields = array(
            'PDECA_TRANSPORT_DATE' => array($this->l('Transport date (YYYY-MM-DD)'), $value('transport_date')),
            'PDECA_TRACTOR_REGISTRATION' => array($this->l('Tractor registration'), $value('tractor_registration')),
            'PDECA_TRAILER_REGISTRATION' => array($this->l('Trailer registration'), $value('trailer_registration')),
            'PDECA_CARRIER_NAME' => array($this->l('Effective carrier legal name'), $value('carrier_name')),
            'PDECA_CARRIER_TAX_ID' => array($this->l('Effective carrier tax ID'), $value('carrier_tax_id')),
            'PDECA_WEIGHT_KG' => array($this->l('Shipment weight override (kg)'), $value('weight_kg')),
            'PDECA_SPECIAL_AUTHORIZATION' => array($this->l('Special traffic authorization'), $value('special_authorization')),
        );

        $html = '<div class="panel"><h3>' . sprintf($this->l('Order #%d transport data'), $orderId)
            . '</h3><form method="post" action="' . Tools::safeOutput($action) . '">';

        foreach ($fields as $name => $field) {
            $html .= '<div class="form-group"><label>' . Tools::safeOutput($field[0])
                . '</label><input class="form-control" type="text" name="' . Tools::safeOutput($name)
                . '" value="' . Tools::safeOutput($field[1]) . '"></div>';
        }

        return $html
            . '<input type="hidden" name="PDECA_ORDER_ID" value="' . (int) $orderId . '">'
            . '<button class="btn btn-primary" type="submit" name="submitPuenteDecaProcess" value="1">'
            . $this->l('Save transport data and generate / refresh DeCA')
            . '</button></form></div>';
    }

    public function settings()
    {
        $shopId = (int) $this->context->shop->id;

        return array(
            'endpoint' => (string) Configuration::get(self::CONFIG_ENDPOINT, null, null, $shopId),
            'request_timeout' => (int) Configuration::get(self::CONFIG_TIMEOUT, null, null, $shopId),
            'shipper_name' => (string) Configuration::get(self::CONFIG_SHIPPER_NAME, null, null, $shopId),
            'shipper_tax_id' => (string) Configuration::get(self::CONFIG_SHIPPER_TAX_ID, null, null, $shopId),
            'shipper_address' => (string) Configuration::get(self::CONFIG_SHIPPER_ADDRESS, null, null, $shopId),
            'origin' => (string) Configuration::get(self::CONFIG_ORIGIN, null, null, $shopId),
            'carrier_name' => (string) Configuration::get(self::CONFIG_CARRIER_NAME, null, null, $shopId),
            'carrier_tax_id' => (string) Configuration::get(self::CONFIG_CARRIER_TAX_ID, null, null, $shopId),
            'shop_id' => $shopId,
            'shop_url' => $this->context->shop->getBaseURL(true),
        );
    }

    private function automaticStateIds()
    {
        $raw = (string) Configuration::get(
            self::CONFIG_AUTO_STATES,
            null,
            null,
            (int) $this->context->shop->id
        );

        if (trim($raw) === '') {
            return array();
        }

        return array_values(
            array_unique(
                array_filter(
                    array_map('intval', preg_split('/\s*,\s*/', $raw)),
                    function ($value) {
                        return $value > 0;
                    }
                )
            )
        );
    }

    public function getSyncRow($orderId)
    {
        $shopId = (int) $this->context->shop->id;
        $row = Db::getInstance()->getRow(
            'SELECT * FROM `' . _DB_PREFIX_ . 'pdeca_order_sync`'
            . ' WHERE `id_shop` = ' . $shopId
            . ' AND `id_order` = ' . (int) $orderId
        );

        return is_array($row) ? $row : null;
    }

    public function saveLogistics($orderId, array $values)
    {
        $existing = $this->getSyncRow($orderId);

        return $this->saveRawSync(
            (int) $orderId,
            is_array($existing) ? (string) $existing['shipment_id'] : '',
            is_array($existing) ? (string) $existing['document_id'] : '',
            is_array($existing) ? (string) $existing['status'] : 'configured',
            is_array($existing) ? (string) $existing['last_error'] : '',
            $values
        );
    }

    public function saveSync(Order $order, $shipmentId, $documentId, $status, $lastError)
    {
        $existing = $this->getSyncRow((int) $order->id);
        return $this->saveRawSync(
            (int) $order->id,
            (string) $shipmentId,
            (string) $documentId,
            (string) $status,
            (string) $lastError,
            is_array($existing) ? $existing : array()
        );
    }

    private function saveRawSync($orderId, $shipmentId, $documentId, $status, $lastError, array $values)
    {
        return Db::getInstance()->execute(
            'REPLACE INTO `' . _DB_PREFIX_ . 'pdeca_order_sync` '
            . '(`id_shop`,`id_order`,`shipment_id`,`document_id`,`status`,`last_error`,'
            . '`transport_date`,`tractor_registration`,`trailer_registration`,`carrier_name`,'
            . '`carrier_tax_id`,`weight_kg`,`special_authorization`,`date_upd`) VALUES ('
            . (int) $this->context->shop->id . ','
            . (int) $orderId . ',\'' . pSQL($shipmentId) . '\',\'' . pSQL($documentId) . '\',\''
            . pSQL($status) . '\',\'' . pSQL($lastError, true) . '\',\''
            . pSQL(isset($values['transport_date']) ? (string) $values['transport_date'] : '') . '\',\''
            . pSQL(isset($values['tractor_registration']) ? (string) $values['tractor_registration'] : '') . '\',\''
            . pSQL(isset($values['trailer_registration']) ? (string) $values['trailer_registration'] : '') . '\',\''
            . pSQL(isset($values['carrier_name']) ? (string) $values['carrier_name'] : '') . '\',\''
            . pSQL(isset($values['carrier_tax_id']) ? (string) $values['carrier_tax_id'] : '') . '\',\''
            . pSQL(isset($values['weight_kg']) ? (string) $values['weight_kg'] : '') . '\',\''
            . pSQL(isset($values['special_authorization']) ? (string) $values['special_authorization'] : '') . '\',NOW())'
        );
    }

    private function installSchema()
    {
        return (bool) Db::getInstance()->execute(
            'CREATE TABLE IF NOT EXISTS `' . _DB_PREFIX_ . 'pdeca_order_sync` ('
            . '`id_shop` INT UNSIGNED NOT NULL,'
            . '`id_order` INT UNSIGNED NOT NULL,'
            . '`shipment_id` VARCHAR(96) NOT NULL DEFAULT \'\','
            . '`document_id` VARCHAR(96) NOT NULL DEFAULT \'\','
            . '`status` VARCHAR(64) NOT NULL DEFAULT \'configured\','
            . '`last_error` TEXT NULL,'
            . '`transport_date` VARCHAR(10) NOT NULL DEFAULT \'\','
            . '`tractor_registration` VARCHAR(64) NOT NULL DEFAULT \'\','
            . '`trailer_registration` VARCHAR(64) NOT NULL DEFAULT \'\','
            . '`carrier_name` VARCHAR(191) NOT NULL DEFAULT \'\','
            . '`carrier_tax_id` VARCHAR(64) NOT NULL DEFAULT \'\','
            . '`weight_kg` VARCHAR(40) NOT NULL DEFAULT \'\','
            . '`special_authorization` VARCHAR(191) NOT NULL DEFAULT \'\','
            . '`date_upd` DATETIME NOT NULL,'
            . 'PRIMARY KEY (`id_shop`, `id_order`)'
            . ') ENGINE=' . _MYSQL_ENGINE_ . ' DEFAULT CHARSET=utf8mb4;'
        );
    }

    private function uninstallSchema()
    {
        return (bool) Db::getInstance()->execute(
            'DROP TABLE IF EXISTS `' . _DB_PREFIX_ . 'pdeca_order_sync`'
        );
    }
}
