<?php

if (!defined('_PS_VERSION_')) {
    exit;
}

final class PDECAPrestaShopConnector
{
    public static function processOrder(PuenteDeca $module, Order $order)
    {
        $existing = $module->getSyncRow((int) $order->id);
        $logistics = is_array($existing) ? $existing : array();

        try {
            $settings = $module->settings();
            $settings['module_version'] = PuenteDeca::VERSION;

            $client = new PDECAPrestaShopClient($settings);
            $payload = PDECAPrestaShopOrderPayload::build(
                $order,
                $settings,
                $logistics
            );

            $shipmentId = is_array($existing)
                ? trim((string) $existing['shipment_id'])
                : '';

            if ($shipmentId === '') {
                $created = $client->createShipment(
                    $payload,
                    sprintf(
                        'prestashop:%d:order:%d:shipment:v1',
                        (int) $order->id_shop,
                        (int) $order->id
                    )
                );

                $shipmentId = isset($created['shipmentId'])
                    ? trim((string) $created['shipmentId'])
                    : '';

                if ($shipmentId === '') {
                    throw new RuntimeException(
                        'Puente DeCA did not return a shipment ID.'
                    );
                }
            } else {
                $client->updateShipment(
                    $shipmentId,
                    $payload
                );
            }

            $generated = $client->generateDeca($shipmentId);
            $document = isset($generated['document'])
                && is_array($generated['document'])
                ? $generated['document']
                : array();
            $documentId = isset($document['documentId'])
                ? trim((string) $document['documentId'])
                : '';

            if ($documentId === '') {
                throw new RuntimeException(
                    'Puente DeCA did not return a document ID.'
                );
            }

            $module->saveSync(
                $order,
                $shipmentId,
                $documentId,
                !empty($generated['reused'])
                    ? 'ready_reused'
                    : 'ready',
                ''
            );

            return array(
                'ok' => true,
                'shipment_id' => $shipmentId,
                'document_id' => $documentId,
                'reused' => !empty($generated['reused']),
            );
        } catch (Exception $exception) {
            $message = substr(
                (string) $exception->getMessage(),
                0,
                500
            );

            $module->saveSync(
                $order,
                is_array($existing)
                    ? (string) $existing['shipment_id']
                    : '',
                is_array($existing)
                    ? (string) $existing['document_id']
                    : '',
                'blocked',
                $message
            );

            return array(
                'ok' => false,
                'message' => $message,
            );
        }
    }
}
