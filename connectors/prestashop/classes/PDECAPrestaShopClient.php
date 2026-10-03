<?php

if (!defined('_PS_VERSION_')) {
    exit;
}

final class PDECAPrestaShopClient
{
    private $endpoint;
    private $token;
    private $timeout;
    private $version;
    private $shopUrl;

    public function __construct(array $settings)
    {
        $this->endpoint = rtrim((string) $settings['endpoint'], '/');
        $this->token = PDECAPrestaShopSecretStore::get(
            (int) $settings['shop_id']
        );
        $this->timeout = max(5, min(30, (int) $settings['request_timeout']));
        $this->version = isset($settings['module_version'])
            ? (string) $settings['module_version']
            : PuenteDeca::VERSION;
        $this->shopUrl = isset($settings['shop_url'])
            ? (string) $settings['shop_url']
            : '';
    }

    public function configured()
    {
        return strpos($this->endpoint, 'https://') === 0
            && $this->token !== '';
    }

    public function createShipment(array $payload, $idempotencyKey)
    {
        return $this->request(
            'POST',
            '/v1/shipments',
            $payload,
            array('Idempotency-Key' => (string) $idempotencyKey)
        );
    }

    public function updateShipment($shipmentId, array $payload)
    {
        return $this->request(
            'PUT',
            '/v1/shipments/' . rawurlencode((string) $shipmentId),
            $payload
        );
    }

    public function generateDeca($shipmentId)
    {
        return $this->request(
            'POST',
            '/v1/shipments/' . rawurlencode((string) $shipmentId) . '/deca'
        );
    }

    private function request($method, $path, array $body = null, array $extraHeaders = array())
    {
        if (!$this->configured()) {
            throw new RuntimeException('Puente DeCA is not fully configured.');
        }

        $url = $this->endpoint . $path;
        if (strpos($url, 'https://') !== 0) {
            throw new RuntimeException('Puente DeCA requires an HTTPS endpoint.');
        }

        $headers = array(
            'Authorization: Bearer ' . $this->token,
            'Accept: application/json',
            'Content-Type: application/json',
            'X-Connector-Version: prestashop/' . $this->version,
        );
        foreach ($extraHeaders as $key => $value) {
            $headers[] = $key . ': ' . $value;
        }

        $handle = curl_init($url);
        curl_setopt($handle, CURLOPT_CUSTOMREQUEST, strtoupper($method));
        curl_setopt($handle, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($handle, CURLOPT_FOLLOWLOCATION, false);
        curl_setopt($handle, CURLOPT_CONNECTTIMEOUT, $this->timeout);
        curl_setopt($handle, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($handle, CURLOPT_HTTPHEADER, $headers);
        curl_setopt(
            $handle,
            CURLOPT_USERAGENT,
            'PuenteDeCA-PrestaShop/' . $this->version . '; ' . $this->shopUrl
        );

        if ($body !== null) {
            $encoded = json_encode(
                $body,
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            );
            if ($encoded === false) {
                curl_close($handle);
                throw new RuntimeException('Puente DeCA payload could not be encoded.');
            }
            curl_setopt($handle, CURLOPT_POSTFIELDS, $encoded);
        }

        $raw = curl_exec($handle);
        $curlError = curl_error($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
        curl_close($handle);

        if ($raw === false) {
            throw new RuntimeException(
                'Puente DeCA could not be reached: ' . substr($curlError, 0, 200)
            );
        }

        $json = json_decode((string) $raw, true);
        if (!is_array($json)) {
            throw new RuntimeException('Puente DeCA returned an invalid response.');
        }

        if ($status < 200 || $status >= 300) {
            $message = isset($json['message'])
                ? (string) $json['message']
                : 'Puente DeCA rejected the request.';
            throw new RuntimeException(substr($message, 0, 500));
        }

        return $json;
    }
}
