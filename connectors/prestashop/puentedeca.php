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
    const VERSION = '0.1.2';
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

        $this->displayName = $this->l('DeCA Transporte');
        $this->description = $this->l('Genera y mantiene documentos DeCA desde pedidos PrestaShop con Cargo Connect.');
        $this->confirmUninstall = $this->l('¿Desinstalar DeCA Transporte? Se eliminará el estado local del conector, pero no los documentos DeCA remotos.');
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
        if (Tools::isSubmit('submitPuenteDecaTestConnection')) {
            $output .= $this->testConnection();
        }

        return $output
            . $this->renderFirstUsePanel()
            . $this->renderSettingsForm()
            . $this->renderConnectionTestPanel()
            . $this->renderManualOrderPanel();
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
        $shipmentId = is_array($row) ? (string) $row['shipment_id'] : '';
        $documentId = is_array($row) ? (string) $row['document_id'] : '';
        $accessUrlRaw = is_array($row) && isset($row['access_url']) ? (string) $row['access_url'] : '';
        $accessUrl = strpos($accessUrlRaw, 'https://') === 0 ? $accessUrlRaw : '';
        $lastError = is_array($row) ? (string) $row['last_error'] : '';

        $statusLabels = array(
            'ready' => $this->l('Listo'),
            'ready_reused' => $this->l('Listo · sin cambios'),
            'blocked' => $this->l('Requiere atención'),
            'configured' => $this->l('Datos guardados'),
            'not_configured' => $this->l('Aún no generado'),
        );
        $statusLabel = isset($statusLabels[$status]) ? $statusLabels[$status] : $status;

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
            . $this->l('DeCA Transporte') . '</h3><div class="card-body">'
            . '<p><strong>' . $this->l('Estado:') . '</strong> ' . Tools::safeOutput($statusLabel) . '</p>';

        if ($shipmentId !== '') {
            $html .= '<p><strong>' . $this->l('Expedición:') . '</strong> ' . Tools::safeOutput($shipmentId) . '</p>';
        }
        if ($documentId !== '') {
            $html .= '<p><strong>' . $this->l('DeCA actual:') . '</strong> ' . Tools::safeOutput($documentId) . '</p>';
        }
        if ($accessUrl !== '') {
            $html .= '<p><a class="btn btn-primary" href="' . Tools::safeOutput($accessUrl)
                . '" target="_blank" rel="noopener noreferrer">' . $this->l('Abrir documento DeCA') . '</a></p>';
        }
        if ($lastError !== '') {
            $html .= '<div class="alert alert-warning"><strong>' . $this->l('Último error:') . '</strong> '
                . Tools::safeOutput($lastError) . '</div>';
        }

        return $html . '<a class="btn btn-default" href="' . Tools::safeOutput($url) . '">'
            . $this->l('Completar datos / generar DeCA') . '</a></div></div>';
    }

    private function saveSettings()
    {
        $shopId = (int) $this->context->shop->id;
        $endpoint = rtrim(trim((string) Tools::getValue(self::CONFIG_ENDPOINT)), '/');
        $timeout = max(5, min(30, (int) Tools::getValue(self::CONFIG_TIMEOUT, 15)));
        $token = trim((string) Tools::getValue('PDECA_PS_API_KEY'));

        if ($endpoint === '' || strpos($endpoint, 'https://') !== 0) {
            return $this->displayError($this->l('La URL de DeCA Transporte debe usar HTTPS.'));
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
            return $this->displayError($this->l('La clave API no pudo cifrarse en este servidor.'));
        }

        if ((int) Tools::getValue('PDECA_PS_CLEAR_API_KEY', 0) === 1) {
            PDECAPrestaShopSecretStore::delete($shopId);
        }

        return $this->displayConfirmation($this->l('Configuración de DeCA Transporte guardada. La clave API queda cifrada y no se vuelve a mostrar.'));
    }

    private function testConnection()
    {
        try {
            $client = new PDECAPrestaShopClient($this->settings());
            $client->testConnection();

            return $this->displayConfirmation(
                $this->l('La conexión con DeCA Transporte funciona correctamente.')
            );
        } catch (Exception $exception) {
            return $this->displayError(
                $this->l('No se pudo conectar con DeCA Transporte: ')
                . Tools::safeOutput(
                    substr(
                        (string) $exception->getMessage(),
                        0,
                        300
                    )
                )
            );
        }
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
            return $this->displayError($this->l('Pedido no válido.'));
        }

        $this->saveLogistics(
            $orderId,
            array(
                'transport_date' => trim((string) Tools::getValue('PDECA_TRANSPORT_DATE')),
                'tractor_registration' => strtoupper(trim((string) Tools::getValue('PDECA_TRACTOR_REGISTRATION'))),
                'trailer_registration' => strtoupper(trim((string) Tools::getValue('PDECA_TRAILER_REGISTRATION'))),
                'carrier_name' => trim((string) Tools::getValue('PDECA_CARRIER_NAME')),
                'carrier_tax_id' => strtoupper(trim((string) Tools::getValue('PDECA_CARRIER_TAX_ID'))),
                'weight_kg' => str_replace(',', '.', trim((string) Tools::getValue('PDECA_WEIGHT_KG'))),
                'special_authorization' => trim((string) Tools::getValue('PDECA_SPECIAL_AUTHORIZATION')),
            )
        );

        $result = PDECAPrestaShopConnector::processOrder($this, $order);
        if (!empty($result['ok'])) {
            return $this->displayConfirmation($this->l('DeCA generado o actualizado correctamente.'));
        }

        return $this->displayError(
            isset($result['message'])
                ? Tools::safeOutput((string) $result['message'])
                : $this->l('No se pudo generar el DeCA del pedido.')
        );
    }

    private function missingBasicConfiguration()
    {
        $shopId = (int) $this->context->shop->id;
        $required = array(
            self::CONFIG_ENDPOINT => $this->l('endpoint DeCA Transporte'),
            self::CONFIG_SHIPPER_NAME => $this->l('nombre legal del cargador'),
            self::CONFIG_SHIPPER_TAX_ID => $this->l('NIF/CIF del cargador'),
            self::CONFIG_SHIPPER_ADDRESS => $this->l('dirección del cargador'),
            self::CONFIG_ORIGIN => $this->l('origen de carga'),
        );
        $missing = array();

        foreach ($required as $key => $label) {
            if (trim((string) Configuration::get($key, null, null, $shopId)) === '') {
                $missing[] = $label;
            }
        }

        if (PDECAPrestaShopSecretStore::get($shopId) === '') {
            $missing[] = $this->l('clave API de Cargo Connect');
        }

        return $missing;
    }

    private function renderFirstUsePanel()
    {
        $missing = $this->missingBasicConfiguration();
        $html = '<div class="panel"><h3><i class="icon-check-circle"></i> '
            . $this->l('Primer DeCA') . '</h3>';

        if (empty($missing)) {
            $html .= '<div class="alert alert-success"><strong>' . $this->l('Configuración básica completa.')
                . '</strong> ' . $this->l('Ya puedes probar la conexión y generar tu primer DeCA desde un pedido.') . '</div>';
        } else {
            $html .= '<div class="alert alert-warning"><strong>' . $this->l('Falta completar:') . '</strong> '
                . Tools::safeOutput(implode(', ', $missing)) . '.</div>';
        }

        $html .= '<ol>'
            . '<li>' . $this->l('Guarda la clave de Cargo Connect y los datos básicos de empresa/origen.') . '</li>'
            . '<li>' . $this->l('Pulsa “Probar conexión con DeCA Transporte”.') . '</li>'
            . '<li>' . $this->l('Abre un pedido, pulsa “Completar datos / generar DeCA”, rellena lo necesario y genera el documento.') . '</li>'
            . '</ol>'
            . '<p><a href="https://kairoseth.com/products/kairoseth-cargo" target="_blank" rel="noopener noreferrer">'
            . $this->l('Ver DeCA Transporte y planes Cargo Connect') . '</a></p></div>';

        return $html;
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
            array('type' => 'text', 'label' => $this->l('Endpoint DeCA Transporte'), 'name' => self::CONFIG_ENDPOINT, 'required' => true, 'desc' => $this->l('Normalmente no necesitas cambiar este valor.')),
            array('type' => 'password', 'label' => $this->l('Clave API de Cargo Connect'), 'name' => 'PDECA_PS_API_KEY', 'autocomplete' => false, 'desc' => $this->l('Déjala vacía para conservar la clave cifrada existente.')),
            array(
                'type' => 'switch',
                'label' => $this->l('Eliminar clave API guardada'),
                'name' => 'PDECA_PS_CLEAR_API_KEY',
                'is_bool' => true,
                'values' => array(
                    array('id' => 'pdeca_clear_on', 'value' => 1, 'label' => $this->l('Sí')),
                    array('id' => 'pdeca_clear_off', 'value' => 0, 'label' => $this->l('No')),
                ),
            ),
            array('type' => 'text', 'label' => $this->l('Nombre legal del cargador'), 'name' => self::CONFIG_SHIPPER_NAME, 'required' => true),
            array('type' => 'text', 'label' => $this->l('NIF/CIF del cargador'), 'name' => self::CONFIG_SHIPPER_TAX_ID, 'required' => true),
            array('type' => 'text', 'label' => $this->l('Dirección del cargador'), 'name' => self::CONFIG_SHIPPER_ADDRESS, 'required' => true),
            array('type' => 'text', 'label' => $this->l('Origen de carga por defecto'), 'name' => self::CONFIG_ORIGIN, 'required' => true),
            array('type' => 'text', 'label' => $this->l('Transportista por defecto'), 'name' => self::CONFIG_CARRIER_NAME, 'desc' => $this->l('Opcional si se indica en cada pedido.')),
            array('type' => 'text', 'label' => $this->l('NIF/CIF del transportista por defecto'), 'name' => self::CONFIG_CARRIER_TAX_ID),
            array('type' => 'text', 'label' => $this->l('Avanzado · estados automáticos'), 'name' => self::CONFIG_AUTO_STATES, 'desc' => $this->l('IDs separados por comas. Déjalo vacío para modo manual.')),
            array('type' => 'text', 'label' => $this->l('Avanzado · timeout HTTP (segundos)'), 'name' => self::CONFIG_TIMEOUT, 'required' => true),
        );

        return $helper->generateForm(
            array(
                array(
                    'form' => array(
                        'legend' => array('title' => $this->l('Configuración de DeCA Transporte'), 'icon' => 'icon-truck'),
                        'description' => $this->l('Completa primero la clave de Cargo Connect y los datos básicos. Las opciones marcadas como “Avanzado” pueden dejarse con sus valores por defecto.'),
                        'input' => $fields,
                        'submit' => array('title' => $this->l('Guardar configuración'), 'class' => 'btn btn-default pull-right'),
                    ),
                ),
            )
        );
    }

    private function renderConnectionTestPanel()
    {
        $action = $this->context->link->getAdminLink(
            'AdminModules',
            true,
            array(),
            array(
                'configure' => $this->name,
                'tab_module' => $this->tab,
                'module_name' => $this->name,
            )
        );

        return '<div class="panel"><h3>'
            . $this->l('Comprobar conexión')
            . '</h3><p>'
            . $this->l('Después de guardar los datos básicos, comprueba la conexión antes de generar el primer DeCA.')
            . '</p><form method="post" action="'
            . Tools::safeOutput($action)
            . '"><button class="btn btn-default" type="submit" name="submitPuenteDecaTestConnection" value="1">'
            . $this->l('Probar conexión con DeCA Transporte')
            . '</button></form></div>';
    }

    private function renderManualOrderPanel()
    {
        $orderId = (int) Tools::getValue('PDECA_ORDER_ID');
        if ($orderId <= 0) {
            return '<div class="panel"><h3>' . $this->l('Generar DeCA desde un pedido')
                . '</h3><p>' . $this->l('Abre un pedido y usa la tarjeta DeCA Transporte para cargar aquí sus datos de transporte.')
                . '</p></div>';
        }

        $order = new Order($orderId);
        if (
            !Validate::isLoadedObject($order)
            || (int) $order->id_shop !== (int) $this->context->shop->id
        ) {
            return $this->displayError($this->l('Pedido no válido.'));
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
            'PDECA_TRANSPORT_DATE' => array($this->l('Fecha de transporte (AAAA-MM-DD)'), $value('transport_date')),
            'PDECA_TRACTOR_REGISTRATION' => array($this->l('Matrícula tractora'), $value('tractor_registration')),
            'PDECA_TRAILER_REGISTRATION' => array($this->l('Matrícula remolque'), $value('trailer_registration')),
            'PDECA_CARRIER_NAME' => array($this->l('Transportista efectivo'), $value('carrier_name')),
            'PDECA_CARRIER_TAX_ID' => array($this->l('NIF/CIF del transportista'), $value('carrier_tax_id')),
            'PDECA_WEIGHT_KG' => array($this->l('Peso total opcional (kg)'), $value('weight_kg')),
            'PDECA_SPECIAL_AUTHORIZATION' => array($this->l('Autorización especial opcional'), $value('special_authorization')),
        );

        $html = '<div class="panel"><h3>' . sprintf($this->l('Pedido #%d · datos de transporte'), $orderId)
            . '</h3><p>' . $this->l('Completa solo los datos necesarios. Si el peso queda vacío, el módulo intentará calcularlo con los productos del pedido.')
            . '</p><form method="post" action="' . Tools::safeOutput($action) . '">';

        foreach ($fields as $name => $field) {
            $html .= '<div class="form-group"><label>' . Tools::safeOutput($field[0])
                . '</label><input class="form-control" type="text" name="' . Tools::safeOutput($name)
                . '" value="' . Tools::safeOutput($field[1]) . '"></div>';
        }

        return $html
            . '<input type="hidden" name="PDECA_ORDER_ID" value="' . (int) $orderId . '">'
            . '<button class="btn btn-primary" type="submit" name="submitPuenteDecaProcess" value="1">'
            . $this->l('Guardar datos y generar / actualizar DeCA')
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
            is_array($existing) && isset($existing['access_url']) ? (string) $existing['access_url'] : '',
            is_array($existing) ? (string) $existing['status'] : 'configured',
            is_array($existing) ? (string) $existing['last_error'] : '',
            $values
        );
    }

    public function saveSync(Order $order, $shipmentId, $documentId, $accessUrl, $status, $lastError)
    {
        $existing = $this->getSyncRow((int) $order->id);
        return $this->saveRawSync(
            (int) $order->id,
            (string) $shipmentId,
            (string) $documentId,
            (string) $accessUrl,
            (string) $status,
            (string) $lastError,
            is_array($existing) ? $existing : array()
        );
    }

    private function saveRawSync($orderId, $shipmentId, $documentId, $accessUrl, $status, $lastError, array $values)
    {
        return Db::getInstance()->execute(
            'REPLACE INTO `' . _DB_PREFIX_ . 'pdeca_order_sync` '
            . '(`id_shop`,`id_order`,`shipment_id`,`document_id`,`access_url`,`status`,`last_error`,'
            . '`transport_date`,`tractor_registration`,`trailer_registration`,`carrier_name`,'
            . '`carrier_tax_id`,`weight_kg`,`special_authorization`,`date_upd`) VALUES ('
            . (int) $this->context->shop->id . ','
            . (int) $orderId . ',\'' . pSQL($shipmentId) . '\',\'' . pSQL($documentId) . '\',\''
            . pSQL($accessUrl, true) . '\',\'' . pSQL($status) . '\',\'' . pSQL($lastError, true) . '\',\''
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
            . '`access_url` TEXT NULL,'
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
